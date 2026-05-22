"""Pydantic schemas for MongoDB-backed interview state."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field
from pydantic.json_schema import JsonSchemaValue
from pydantic_core import core_schema


class PyObjectId(str):
    """Pydantic helper for MongoDB ObjectId values."""

    @classmethod
    def validate(cls, value: Any) -> "PyObjectId":
        if value is None:
            return None  # type: ignore[return-value]
        try:
            obj_id = ObjectId(str(value))
        except Exception as exc:  # pragma: no cover
            raise ValueError("Invalid ObjectId") from exc
        return cls(str(obj_id))

    @classmethod
    def __get_pydantic_core_schema__(
        cls, _source_type: Any, _handler: Any
    ) -> core_schema.CoreSchema:
        return core_schema.no_info_after_validator_function(
            cls.validate,
            core_schema.str_schema(),
        )

    @classmethod
    def __get_pydantic_json_schema__(
        cls, _core_schema: core_schema.CoreSchema, _handler: Any
    ) -> JsonSchemaValue:
        return {"type": "string"}


class InterviewConfig(BaseModel):
    role: str
    jd: str
    experience_min: int
    experience_max: int
    domain: str
    interview_type: Literal["technical", "behavioural", "mixed"]
    difficulty: Literal["easy", "medium", "hard"]
    num_questions: int = 8
    candidate_name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = ConfigDict(populate_by_name=True)


class Question(BaseModel):
    id: int
    text: str
    rubric: str
    difficulty_tag: Literal["warm_up", "core", "stretch"]
    weight: int = 10

    model_config = ConfigDict(populate_by_name=True)


class Turn(BaseModel):
    role: Literal["interviewer", "candidate"]
    text: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    model_config = ConfigDict(populate_by_name=True)


class SessionState(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    session_id: str
    config: InterviewConfig
    questions: list[Question]
    turns: list[Turn] = Field(default_factory=list)
    current_question_index: int = 0
    status: Literal["not_started", "in_progress", "completed"] = "not_started"
    scores: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str},
    )


class ChatRequest(BaseModel):
    session_id: str
    message: str

    model_config = ConfigDict(populate_by_name=True)


class SetupRequest(InterviewConfig):
    """API body for starting a session (same fields as InterviewConfig)."""

    model_config = ConfigDict(populate_by_name=True)
