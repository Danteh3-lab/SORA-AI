from __future__ import annotations

import wave
from io import BytesIO

from sora_assistant.config import ApiKeyStore, AssistantConfig
from sora_assistant.models import AudioResult
from sora_assistant.providers.base import TextToSpeechProvider


NVIDIA_SPEECH_SERVER = "grpc.nvcf.nvidia.com:443"
MAGPIE_TTS_FUNCTION_ID = "877104f7-e885-42b9-8de8-f6e4c6303969"
MAGPIE_TTS_MODELS = {"magpie-tts-multilingual", "nvidia/magpie-tts-multilingual"}
DEFAULT_MAGPIE_VOICE = "Magpie-Multilingual.EN-US.Aria"


def pcm_to_wav(
    pcm_audio: bytes,
    *,
    sample_rate_hz: int,
    channels: int = 1,
    sample_width: int = 2,
) -> bytes:
    buffer = BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(sample_width)
        wav_file.setframerate(sample_rate_hz)
        wav_file.writeframes(pcm_audio)
    return buffer.getvalue()


class NvidiaTextToSpeechProvider(TextToSpeechProvider):
    name = "nvidia_nim"

    def __init__(self, config: AssistantConfig, service=None) -> None:
        self.config = config
        self.model = config.tts_model
        self._service = service

    def _build_service(self):
        api_key = ApiKeyStore().get_api_key("nvidia")
        if not api_key:
            raise RuntimeError("Missing NVIDIA_API_KEY. Add it in Settings or the OS keyring.")
        if self.model not in MAGPIE_TTS_MODELS:
            raise RuntimeError(
                "NVIDIA TTS currently supports magpie-tts-multilingual for Discord/web speech output."
            )
        try:
            import riva.client
        except ImportError as exc:
            raise RuntimeError("Install nvidia-riva-client to use NVIDIA text-to-speech.") from exc

        auth = riva.client.Auth(
            uri=NVIDIA_SPEECH_SERVER,
            use_ssl=True,
            metadata_args=[
                ["function-id", MAGPIE_TTS_FUNCTION_ID],
                ["authorization", f"Bearer {api_key}"],
            ],
        )
        return riva.client.SpeechSynthesisService(auth)

    def speak(self, text: str, voice_settings: dict[str, str] | None = None) -> AudioResult:
        settings = voice_settings or {}
        voice_name = settings.get("voice", self.config.tts_voice or DEFAULT_MAGPIE_VOICE)
        language_code = settings.get("language_code", "en-US")
        sample_rate_hz = int(settings.get("sample_rate_hz", 22050))
        custom_configuration = {}
        if style := settings.get("style"):
            custom_configuration["style"] = style

        try:
            import riva.client

            response = (self._service or self._build_service()).synthesize(
                text=text,
                voice_name=voice_name,
                language_code=language_code,
                encoding=riva.client.AudioEncoding.LINEAR_PCM,
                sample_rate_hz=sample_rate_hz,
                custom_configuration=custom_configuration or None,
            )
            wav_audio = pcm_to_wav(response.audio, sample_rate_hz=sample_rate_hz)
        except RuntimeError:
            raise
        except Exception as exc:
            raise RuntimeError(f"NVIDIA text-to-speech failed: {exc}") from exc

        return AudioResult(
            audio=wav_audio,
            provider=self.name,
            model=self.model,
            mime_type="audio/wav",
            raw={"voice": voice_name, "language_code": language_code, "sample_rate_hz": sample_rate_hz},
        )
