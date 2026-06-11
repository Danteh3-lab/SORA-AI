from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

from sora_assistant.models import utc_now


@dataclass(frozen=True)
class AssistantEvent:
    type: str
    payload: dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=utc_now)


class EventBus:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[AssistantEvent]] = set()
        self.history: list[AssistantEvent] = []

    def publish(self, event_type: str, payload: dict[str, Any] | None = None) -> AssistantEvent:
        event = AssistantEvent(type=event_type, payload=payload or {})
        self.history.append(event)
        for queue in list(self._subscribers):
            queue.put_nowait(event)
        return event

    async def subscribe(self):
        queue: asyncio.Queue[AssistantEvent] = asyncio.Queue()
        self._subscribers.add(queue)
        try:
            while True:
                yield await queue.get()
        finally:
            self._subscribers.discard(queue)

