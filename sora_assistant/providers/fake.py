from __future__ import annotations

from typing import Any

from sora_assistant.models import AssistantResponse, AudioResult, Message, TranscriptionResult
from sora_assistant.providers.base import LLMProvider, SpeechToTextProvider, TextToSpeechProvider


class FakeLLMProvider(LLMProvider):
    name = "fake"

    def __init__(self, model: str = "fake-llm") -> None:
        self.model = model

    def generate(
        self,
        messages: list[Message],
        tools: list[dict[str, Any]] | None = None,
        settings: dict[str, Any] | None = None,
    ) -> AssistantResponse:
        last_user = next((message.content for message in reversed(messages) if message.role == "user"), "")
        text = f"I heard you say: {last_user}" if last_user else "I am ready."
        return AssistantResponse(text=text, provider=self.name, model=self.model)


class FakeSpeechToTextProvider(SpeechToTextProvider):
    name = "fake"

    def __init__(self, transcript: str = "voice test", model: str = "fake-stt") -> None:
        self.transcript = transcript
        self.model = model

    def transcribe(self, audio: bytes, filename: str = "audio.wav") -> TranscriptionResult:
        return TranscriptionResult(text=self.transcript, provider=self.name, model=self.model)


class FakeTextToSpeechProvider(TextToSpeechProvider):
    name = "fake"

    def __init__(self, model: str = "fake-tts") -> None:
        self.model = model

    def speak(self, text: str, voice_settings: dict[str, Any] | None = None) -> AudioResult:
        return AudioResult(audio=text.encode("utf-8"), provider=self.name, model=self.model, mime_type="text/plain")

