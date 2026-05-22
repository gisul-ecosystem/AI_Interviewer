import json
import logging
import asyncio
import os

import httpx
from deepgram import DeepgramClient, LiveOptions, LiveTranscriptionEvents
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, StreamingResponse
from livekit import api as livekit_api
from openai import AsyncOpenAI
from pydantic import BaseModel

from core.config import settings
from interviewer.question_generator import generate_questions
from interviewer.prompts import (
    build_interviewer_system_prompt,
    build_scoring_prompt,
    get_domain_keywords,
)
from interviewer.session_manager import session_manager
from models.schemas import (
    ChatRequest,
    InterviewConfig,
    Question,
    SessionState,
    SetupRequest,
    Turn,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/interview")


def _strip_markdown_fences(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```json"):
        stripped = stripped[len("```json") :].lstrip()
    elif stripped.startswith("```"):
        stripped = stripped[len("```") :].lstrip()
    if stripped.endswith("```"):
        stripped = stripped[: -len("```")].rstrip()
    return stripped


class ScoreRequest(BaseModel):
    session_id: str


class SpeakRequest(BaseModel):
    text: str
    session_id: str


@router.post("/setup")
async def setup(payload: SetupRequest):
    try:
        config = InterviewConfig(**payload.model_dump())
        questions: list[Question] = await generate_questions(config)
        session: SessionState = await session_manager.create_session(
            config=config, questions=questions
        )
        session_id = session.session_id

        questions_response = [
            {
                "id": q.id,
                "text": q.text,
                "difficulty_tag": q.difficulty_tag,
                "weight": q.weight,
            }
            for q in questions
        ]

        lk = livekit_api.LiveKitAPI(
            url=os.getenv("LIVEKIT_URL"),
            api_key=os.getenv("LIVEKIT_API_KEY"),
            api_secret=os.getenv("LIVEKIT_API_SECRET"),
        )
        room_name = f"interview-{session_id}"
        await lk.room.create_room(
            livekit_api.CreateRoomRequest(
                name=room_name,
                metadata=json.dumps({"session_id": session_id}),
                empty_timeout=300,
            )
        )

        token = (
            livekit_api.AccessToken(
                os.getenv("LIVEKIT_API_KEY"),
                os.getenv("LIVEKIT_API_SECRET"),
            )
            .with_identity(f"candidate-{session_id[:8]}")
            .with_name(config.candidate_name)
            .with_grants(
                livekit_api.VideoGrants(
                    room_join=True,
                    room=room_name,
                    can_publish=True,
                    can_subscribe=True,
                )
            )
            .to_jwt()
        )

        return {
            "session_id": session_id,
            "candidate_name": session.config.candidate_name,
            "role": session.config.role,
            "questions_count": len(questions_response),
            "questions": questions_response,
            "livekit_url": os.getenv("LIVEKIT_URL"),
            "livekit_token": token,
            "room_name": room_name,
        }
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Setup failed: {error}") from error


@router.post("/chat")
async def chat(payload: ChatRequest):
    session = await session_manager.get_session(payload.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == "completed":
        return {
            "reply": "This interview has already been completed.",
            "is_complete": True,
        }

    # 1) Add candidate turn
    await session_manager.add_turn(
        session_id=payload.session_id, role="candidate", text=payload.message
    )

    # 2) Prepare OpenAI messages
    system_msg = {
        "role": "system",
        "content": build_interviewer_system_prompt(session.config, session.questions),
    }
    history = await session_manager.get_conversation_history(payload.session_id)

    # 3) Call OpenAI
    try:
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        completion = await client.chat.completions.create(
            model=settings.MODEL_NAME,
            messages=[system_msg] + history,
            temperature=0.6,
            max_tokens=200,
        )
        reply = (completion.choices[0].message.content or "").strip()
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Chat failed: {error}") from error

    # 4) Add interviewer reply
    session_after_reply = await session_manager.add_turn(
        session_id=payload.session_id, role="interviewer", text=reply
    )

    # 5) Mark complete if closing phrase detected
    completion_phrases = [
        "that completes your interview",
        "thank you for your time",
        "we will be in touch",
    ]
    is_complete = any(phrase in reply.lower() for phrase in completion_phrases)
    if is_complete:
        await session_manager.mark_complete(payload.session_id)

    return {
        "reply": reply,
        "is_complete": is_complete,
        "turn_count": len(session_after_reply.turns),
    }


@router.post("/score")
async def score(payload: ScoreRequest):
    session = await session_manager.get_session(payload.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    candidate_turns = [t for t in session.turns if t.role == "candidate"]
    max_pairs = min(len(candidate_turns), len(session.questions))

    scores: dict = {}
    try:
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        for idx in range(max_pairs):
            question = session.questions[idx]
            candidate_answer = candidate_turns[idx].text

            scoring_prompt = build_scoring_prompt(question, candidate_answer)
            completion = await client.chat.completions.create(
                model=settings.MODEL_NAME,
                messages=[{"role": "user", "content": scoring_prompt}],
                temperature=0,
                max_tokens=300,
            )

            content = (completion.choices[0].message.content or "").strip()
            content = _strip_markdown_fences(content)
            parsed = json.loads(content)

            await session_manager.save_score(
                session_id=payload.session_id,
                question_id=question.id,
                score_data=parsed,
            )
            scores[question.id] = parsed
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Scoring failed: {error}") from error

    return {"session_id": payload.session_id, "scores": scores}


@router.post("/speak")
async def speak(payload: SpeakRequest):
    if not settings.ELEVENLABS_API_KEY:
        raise HTTPException(status_code=500, detail="ELEVENLABS_API_KEY is not configured")

    voice_id = settings.ELEVENLABS_VOICE_ID
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream"
    headers = {
        "xi-api-key": settings.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
    }
    request_body = {
        "text": payload.text,
        "model_id": "eleven_turbo_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.0,
            "use_speaker_boost": True,
        },
    }

    client = httpx.AsyncClient(timeout=60.0)
    try:
        request = client.build_request("POST", url, headers=headers, json=request_body)
        response = await client.send(request, stream=True)
    except Exception as error:
        await client.aclose()
        raise HTTPException(status_code=500, detail=f"ElevenLabs TTS failed: {error}") from error

    if response.status_code >= 400:
        body = await response.aread()
        await response.aclose()
        await client.aclose()
        return JSONResponse(
            status_code=500,
            content={"detail": f"ElevenLabs TTS failed: {body.decode(errors='ignore')}"},
        )

    async def audio_stream():
        try:
            async for chunk in response.aiter_bytes():
                if chunk:
                    yield chunk
        finally:
            await response.aclose()
            await client.aclose()

    return StreamingResponse(audio_stream(), media_type="audio/mpeg")


@router.websocket("/listen/{session_id}")
async def deepgram_proxy(websocket: WebSocket, session_id: str):
    await websocket.accept()

    from deepgram import DeepgramClient, LiveOptions, LiveTranscriptionEvents

    session = await session_manager.get_session(session_id)
    if not session:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close(code=1008)
        return

    deepgram = DeepgramClient(settings.DEEPGRAM_API_KEY)
    transcript_buffer = ""
    dg_connection = None

    try:
        dg_connection = deepgram.listen.asynclive.v("1")

        async def on_transcript(self, result, **kwargs):
            nonlocal transcript_buffer
            sentence = result.channel.alternatives[0].transcript

            if not sentence:
                return

            if result.is_final:
                transcript_buffer += sentence + " "
                await websocket.send_json(
                    {
                        "type": "transcript",
                        "text": transcript_buffer.strip(),
                        "is_final": False,
                        "delta": sentence,
                    }
                )
            else:
                await websocket.send_json(
                    {
                        "type": "transcript",
                        "text": transcript_buffer + sentence,
                        "is_final": False,
                        "delta": sentence,
                    }
                )

        async def on_utterance_end(self, utterance_end, **kwargs):
            nonlocal transcript_buffer
            if transcript_buffer.strip():
                await websocket.send_json(
                    {
                        "type": "utterance_end",
                        "text": transcript_buffer.strip(),
                    }
                )
                transcript_buffer = ""

        async def on_error(self, error, **kwargs):
            await websocket.send_json(
                {
                    "type": "error",
                    "message": str(error),
                }
            )

        dg_connection.on(LiveTranscriptionEvents.Transcript, on_transcript)
        dg_connection.on(LiveTranscriptionEvents.UtteranceEnd, on_utterance_end)
        dg_connection.on(LiveTranscriptionEvents.Error, on_error)

        options = LiveOptions(
            model="nova-2",
            language="en-IN",
            smart_format=True,
            interim_results=True,
            utterance_end_ms=1500,
            vad_events=True,
            punctuate=True,
            diarize=False,
            filler_words=True,
            keywords=get_domain_keywords(session.config),
        )

        await dg_connection.start(options)

        while True:
            try:
                data = await websocket.receive_bytes()
                await dg_connection.send(data)
            except WebSocketDisconnect:
                break
            except Exception:
                break

    finally:
        try:
            if dg_connection:
                await dg_connection.finish()
        except Exception:
            pass


@router.get("/session/{session_id}")
async def get_session(session_id: str):
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session
