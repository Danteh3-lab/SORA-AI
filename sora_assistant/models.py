from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any, Literal
from uuid import uuid4


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return uuid4().hex


class AssistantState(StrEnum):
    IDLE = "idle"
    LISTENING = "listening"
    TRANSCRIBING = "transcribing"
    THINKING = "thinking"
    SPEAKING = "speaking"


Role = Literal["system", "user", "assistant", "tool"]


@dataclass(frozen=True)
class Message:
    role: Role
    content: str
    created_at: str = field(default_factory=utc_now)


@dataclass(frozen=True)
class AssistantResponse:
    text: str
    provider: str
    model: str | None = None
    raw: dict[str, Any] | None = None


@dataclass(frozen=True)
class TranscriptionResult:
    text: str
    provider: str
    model: str | None = None
    language: str | None = None
    raw: dict[str, Any] | None = None


@dataclass(frozen=True)
class AudioResult:
    audio: bytes
    provider: str
    model: str | None = None
    mime_type: str = "audio/mpeg"
    raw: dict[str, Any] | None = None


@dataclass(frozen=True)
class Memory:
    id: str
    text: str
    tags: list[str]
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class SessionSummary:
    id: str
    title: str
    created_at: str
    updated_at: str
    message_count: int = 0


@dataclass(frozen=True)
class AssistantTurn:
    session_id: str
    user_text: str
    assistant_text: str
    state_history: list[AssistantState]
    audio: AudioResult | None = None
    saved_memory: Memory | None = None


def to_jsonable(value: Any) -> Any:
    if hasattr(value, "__dataclass_fields__"):
        return {k: to_jsonable(v) for k, v in asdict(value).items()}
    if isinstance(value, StrEnum):
        return str(value)
    if isinstance(value, bytes):
        return {"bytes": len(value)}
    if isinstance(value, list):
        return [to_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {key: to_jsonable(item) for key, item in value.items()}
    return value

