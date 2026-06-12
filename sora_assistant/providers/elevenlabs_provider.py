from __future__ import annotations

from typing import Any
from urllib.parse import quote

from sora_assistant.config import ApiKeyStore, AssistantConfig
from sora_assistant.models import AudioResult
from sora_assistant.providers.base import TextToSpeechProvider


def _headers() -> dict[str, str]:
    api_key = ApiKeyStore().get_api_key("elevenlabs")
    if not api_key:
        raise RuntimeError("Missing ELEVENLABS_API_KEY. Add it in Settings or the OS keyring.")
    return {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }


def _client():
    try:
        import requests
    except ImportError as exc:
        raise RuntimeError("Install the requests package to use the ElevenLabs provider.") from exc
    return requests


class ElevenLabsTextToSpeechProvider(TextToSpeechProvider):
    name = "elevenlabs"

    def __init__(self, config: AssistantConfig, client: Any | None = None) -> None:
        self.config = config
        self.model = config.tts_model
        self.voice_id = config.tts_voice
        self._client = client

    def speak(self, text: str, voice_settings: dict[str, Any] | None = None) -> AudioResult:
        payload: dict[str, Any] = {
            "text": text,
            "model_id": self.model,
        }
        if voice_settings:
            payload["voice_settings"] = voice_settings

        voice_id = quote(self.voice_id, safe="")
        headers = _headers()
        try:
            client = self._client or _client()
            response = client.post(
                f"{self.config.elevenlabs_base_url.rstrip('/')}/text-to-speech/{voice_id}?output_format=mp3_44100_128",
                headers=headers,
                json=payload,
                timeout=60,
            )
            response.raise_for_status()
        except Exception as exc:
            raise RuntimeError(f"ElevenLabs speech request failed: {exc}") from exc
        return AudioResult(
            audio=response.content,
            provider=self.name,
            model=self.model,
            mime_type="audio/mpeg",
        )
