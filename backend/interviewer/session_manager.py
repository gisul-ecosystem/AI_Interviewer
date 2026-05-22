import uuid
from datetime import datetime
from typing import Any

from core.database import sessions_collection
from models.schemas import InterviewConfig, Question, SessionState, Turn


class SessionManager:
    async def create_session(
        self, config: InterviewConfig, questions: list[Question]
    ) -> SessionState:
        session_id = str(uuid.uuid4())
        session = SessionState(
            session_id=session_id,
            config=config,
            questions=questions,
            status="not_started",
        )
        document = session.model_dump(by_alias=True, mode="json", exclude_none=True)
        await sessions_collection.insert_one(document)
        return session

    async def get_session(self, session_id: str) -> SessionState | None:
        document = await sessions_collection.find_one({"session_id": session_id})
        if not document:
            return None
        if "_id" in document and document["_id"] is not None:
            document["_id"] = str(document["_id"])
        return SessionState(**document)

    async def add_turn(self, session_id: str, role: str, text: str) -> SessionState:
        turn = Turn(role=role, text=text)
        existing_session = await self.get_session(session_id)
        if not existing_session:
            raise ValueError(f"Session not found: {session_id}")

        set_data: dict[str, Any] = {"updated_at": datetime.utcnow()}
        if existing_session.status == "not_started":
            set_data["status"] = "in_progress"

        await sessions_collection.update_one(
            {"session_id": session_id},
            {
                "$push": {"turns": turn.model_dump(mode="json")},
                "$set": set_data,
            },
        )

        updated_session = await self.get_session(session_id)
        if not updated_session:
            raise ValueError(f"Session not found after update: {session_id}")
        return updated_session

    async def get_conversation_history(self, session_id: str) -> list[dict]:
        session = await self.get_session(session_id)
        if not session:
            return []

        history = []
        for turn in session.turns:
            mapped_role = "assistant" if turn.role == "interviewer" else "user"
            history.append({"role": mapped_role, "content": turn.text})
        return history

    async def mark_complete(self, session_id: str) -> None:
        await sessions_collection.update_one(
            {"session_id": session_id},
            {"$set": {"status": "completed", "updated_at": datetime.utcnow()}},
        )

    async def save_score(
        self, session_id: str, question_id: int, score_data: dict
    ) -> None:
        await sessions_collection.update_one(
            {"session_id": session_id},
            {
                "$set": {
                    f"scores.{question_id}": score_data,
                    "updated_at": datetime.utcnow(),
                }
            },
        )

    async def is_complete(self, session_id: str) -> bool:
        session = await self.get_session(session_id)
        return bool(session and session.status == "completed")


session_manager = SessionManager()
