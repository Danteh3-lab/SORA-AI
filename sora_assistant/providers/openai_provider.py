from __future__ import annotations

from io import BytesIO
from typing import Any

from sora_assistant.config import ApiKeyStore, AssistantConfig
from sora_assistant.models import AssistantResponse, AudioResult, Message, TranscriptionResult
from sora_assistant.providers.base import LLMProvider, SpeechToTextProvider, TextToSpeechProvider


def _client(config: AssistantConfig):
    api_key = ApiKeyStore().get_api_key("openai")
    if not api_key:
        raise RuntimeError("Missing OPENAI_API_KEY. Set it in .env or OS keyring.")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise RuntimeError("Install the openai package to use the OpenAI provider.") from exc

    kwargs: dict[str, Any] = {"api_key": api_key}
    if config.openai_base_url:
        kwargs["base_url"] = config.openai_base_url
    return OpenAI(**kwargs)


class OpenAILLMProvider(LLMProvider):
    name = "openai"

    def __init__(self, config: AssistantConfig) -> None:
        self.config = config
        self.model = config.llm_model
        self._client = None

    def generate(
        self,
        messages: list[Message],
        tools: list[dict[str, Any]] | None = None,
        settings: dict[str, Any] | None = None,
    ) -> AssistantResponse:
        payload: dict[str, Any] = {
            "model": self.model,
            "input": [{"role": message.role, "content": message.content} for message in messages],
        }
        if tools:
            payload["tools"] = tools
        if settings:
            payload.update(settings)

        try:
            client = self._client or _client(self.config)
            response = client.responses.create(**payload)
        except Exception as exc:
            raise RuntimeError(f"OpenAI LLM request failed: {exc}") from exc
        text = getattr(response, "output_text", None)
        if not text:
            text = str(response)
        return AssistantResponse(text=text, provider=self.name, model=self.model)


class OpenAISpeechToTextProvider(SpeechToTextProvider):
    name = "openai"

    def __init__(self, config: AssistantConfig) -> None:
        self.config = config
        self.model = config.stt_model
        self._client = None

    def transcribe(self, audio: bytes, filename: str = "audio.wav") -> TranscriptionResult:
        file_obj = BytesIO(audio)
        file_obj.name = filename
        try:
            client = self._client or _client(self.config)
            response = client.audio.transcriptions.create(
                model=self.model,
                file=file_obj,
                response_format="json",
            )
        except Exception as exc:
            raise RuntimeError(f"OpenAI transcription request failed: {exc}") from exc
        text = getattr(response, "text", "")
        return TranscriptionResult(text=text, provider=self.name, model=self.model)


class OpenAITextToSpeechProvider(TextToSpeechProvider):
    name = "openai"

    def __init__(self, config: AssistantConfig) -> None:
        self.config = config
        self.model = config.tts_model
        self._client = None

    def speak(self, text: str, voice_settings: dict[str, Any] | None = None) -> AudioResult:
        settings = voice_settings or {}
        try:
            client = self._client or _client(self.config)
            response = client.audio.speech.create(
                model=self.model,
                voice=settings.get("voice", self.config.tts_voice),
                input=text,
                response_format=settings.get("response_format", "mp3"),
            )
        except Exception as exc:
            raise RuntimeError(f"OpenAI speech request failed: {exc}") from exc
        if hasattr(response, "read"):
            audio = response.read()
        else:
            audio = getattr(response, "content", b"")
        return AudioResult(audio=audio, provider=self.name, model=self.model, mime_type="audio/mpeg")
