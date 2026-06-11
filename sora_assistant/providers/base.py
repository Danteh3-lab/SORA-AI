from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from sora_assistant.models import AssistantResponse, AudioResult, Message, TranscriptionResult


class LLMProvider(ABC):
    name: str

    @abstractmethod
    def generate(
        self,
        messages: list[Message],
        tools: list[dict[str, Any]] | None = None,
        settings: dict[str, Any] | None = None,
    ) -> AssistantResponse:
        raise NotImplementedError


class SpeechToTextProvider(ABC):
    name: str

    @abstractmethod
    def transcribe(self, audio: bytes, filename: str = "audio.wav") -> TranscriptionResult:
        raise NotImplementedError


class TextToSpeechProvider(ABC):
    name: str

    @abstractmethod
    def speak(self, text: str, voice_settings: dict[str, Any] | None = None) -> AudioResult:
        raise NotImplementedError

