import sys
import os
import json
import asyncio
import logging

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"
))

logging.getLogger("pymongo").setLevel(logging.WARNING)
logging.getLogger("pymongo.topology").setLevel(logging.WARNING)
logging.getLogger("pymongo.connection").setLevel(logging.WARNING)

from livekit import agents
from livekit.agents import Agent, AgentSession, RoomInputOptions
from livekit.plugins import deepgram, openai, silero

logger = logging.getLogger("voice-agent")


async def entrypoint(ctx: agents.JobContext):
    logger.info(f"Job received for room: {ctx.room.name}")
    await ctx.connect()
    logger.info("Connected to LiveKit room")

    metadata = {}
    try:
        metadata = json.loads(ctx.room.metadata or "{}")
    except Exception:
        pass

    session_id = metadata.get("session_id")
    logger.info(f"Session ID: {session_id}")

    if not session_id:
        logger.error("No session_id in room metadata")
        return

    from interviewer.session_manager import session_manager
    from interviewer.prompts import build_interviewer_system_prompt

    session = await session_manager.get_session(session_id)
    if not session:
        logger.error(f"Session {session_id} not found")
        return

    config = session.config
    questions = session.questions
    total_questions = len(questions)

    logger.info(f"Loaded session: {config.candidate_name} — {config.role}")
    logger.info(f"Questions: {total_questions}")

    system_prompt = build_interviewer_system_prompt(config, questions)

    vad_instance = None
    try:
        vad_instance = ctx.proc.userdata.get("vad")
    except Exception:
        pass
    if not vad_instance:
        vad_instance = silero.VAD.load(
            min_silence_duration=0.5,
            min_speech_duration=0.1,
            activation_threshold=0.3,
        )

    agent_session = AgentSession(
        vad=vad_instance,
        stt=deepgram.STT(
            model="nova-2",
            language="en-IN",
            smart_format=True,
            punctuate=True,
            filler_words=False,
        ),
        llm=openai.LLM(
            model=os.getenv("MODEL_NAME", "gpt-4o-mini"),
            temperature=0.6,
        ),
        tts=openai.TTS(
            model="tts-1",
            voice="nova",
        ),
        min_endpointing_delay=0.5,
        max_endpointing_delay=6.0,
    )

    completed = False
    candidate_turns = 0
    agent_turns = 0

    @agent_session.on("conversation_item_added")
    def on_item(event):
        nonlocal completed, candidate_turns, agent_turns
        try:
            item = getattr(event, "item", event)
            role = str(getattr(item, "role", "unknown"))
            # Get text content
            content = getattr(item, "content", None) or getattr(item, "text_content", "") or getattr(item, "text", "") or ""
            if hasattr(content, "__iter__") and not isinstance(content, str):
                parts = []
                for c in content:
                    if hasattr(c, "text"):
                        parts.append(str(c.text))
                    else:
                        parts.append(str(c))
                text = " ".join(parts)
            else:
                text = str(content)
            
            logger.info(f"[ITEM role={role}]: {text[:80]}")

            if role in ("user", "human"):
                candidate_turns += 1
                logger.info(f"[CANDIDATE {candidate_turns}/{total_questions}]")
                asyncio.create_task(session_manager.add_turn(session_id, "candidate", text))

            elif role in ("assistant", "agent"):
                agent_turns += 1
                logger.info(f"[ALEX {agent_turns}]: {text[:80]}")
                asyncio.create_task(session_manager.add_turn(session_id, "interviewer", text))

                closing = ["thank you for your time", "completes your interview",
                           "concludes your interview", "we will be in touch",
                           "best of luck", "all the best", "good luck"]

                if not completed and any(p in text.lower() for p in closing):
                    completed = True
                    logger.info(">>> CLOSING PHRASE DETECTED — marking complete")
                    async def _done():
                        await session_manager.mark_complete(session_id)
                        logger.info(">>> SESSION MARKED COMPLETE IN DB")
                    asyncio.create_task(_done())

                elif not completed and candidate_turns >= total_questions and agent_turns >= total_questions:
                    completed = True
                    logger.info(f">>> FALLBACK COMPLETE")
                    async def _fallback():
                        await session_manager.mark_complete(session_id)
                        logger.info(">>> FALLBACK COMPLETE IN DB")
                    asyncio.create_task(_fallback())

        except Exception as e:
            logger.error(f"Error in conversation_item_added: {e}")

    interviewer = Agent(instructions=system_prompt)

    await agent_session.start(
        interviewer,
        room=ctx.room,
        room_input_options=RoomInputOptions(),
    )

    greeting = (
        f"Hi {config.candidate_name}, I'm Alex. "
        f"I'll be conducting your interview for the {config.role} position today. "
        f"Let's get started. "
        f"Could you begin by briefly introducing yourself?"
    )
    logger.info("Sending greeting...")
    await agent_session.say(greeting, allow_interruptions=False)


def prewarm(proc: agents.JobProcess):
    logger.info("Prewarming Silero VAD...")
    proc.userdata["vad"] = silero.VAD.load(
        min_silence_duration=0.5,
        min_speech_duration=0.1,
        activation_threshold=0.3,
    )
    logger.info("VAD prewarmed")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            ws_url=os.getenv("LIVEKIT_URL", "ws://localhost:7880"),
            api_key=os.getenv("LIVEKIT_API_KEY", "devkey"),
            api_secret=os.getenv("LIVEKIT_API_SECRET", "devsecret"),
        )
    )
