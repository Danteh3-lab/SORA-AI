from __future__ import annotations

import wave
from io import BytesIO

from sora_assistant.config import ApiKeyStore, AssistantConfig
from sora_assistant.models import TranscriptionResult
from sora_assistant.providers.base import SpeechToTextProvider


NVIDIA_SPEECH_SERVER = "grpc.nvcf.nvidia.com:443"
NEMOTRON_ASR_FUNCTION_ID = "bb0837de-8c7b-481f-9ec8-ef5663e9c1fa"


class NvidiaSpeechToTextProvider(SpeechToTextProvider):
    name = "nvidia_nim"

    def __init__(self, config: AssistantConfig, service=None) -> None:
        self.config = config
        self.model = config.stt_model
        self._service = service

    def _build_service(self):
        api_key = ApiKeyStore().get_api_key("nvidia")
        if not api_key:
            raise RuntimeError("Missing NVIDIA_API_KEY. Add it in Settings or the OS keyring.")
        try:
            import riva.client
        except ImportError as exc:
            raise RuntimeError("Install nvidia-riva-client to use NVIDIA speech recognition.") from exc

        auth = riva.client.Auth(
            uri=NVIDIA_SPEECH_SERVER,
            use_ssl=True,
            metadata_args=[
                ["function-id", NEMOTRON_ASR_FUNCTION_ID],
                ["authorization", f"Bearer {api_key}"],
            ],
        )
        return riva.client.ASRService(auth)

    def transcribe(self, audio: bytes, filename: str = "audio.wav") -> TranscriptionResult:
        try:
            import riva.client

            with wave.open(BytesIO(audio), "rb") as wav_file:
                if wav_file.getnchannels() != 1 or wav_file.getsampwidth() != 2:
                    raise RuntimeError("NVIDIA ASR requires 16-bit mono WAV audio.")
                sample_rate = wav_file.getframerate()
                raw_audio = wav_file.readframes(wav_file.getnframes())

            config = riva.client.RecognitionConfig(
                encoding=riva.client.AudioEncoding.LINEAR_PCM,
                sample_rate_hertz=sample_rate,
                language_code="en-US",
                max_alternatives=1,
                enable_automatic_punctuation=True,
                audio_channel_count=1,
            )
            streaming_config = riva.client.StreamingRecognitionConfig(
                config=config,
                interim_results=False,
            )
            bytes_per_chunk = sample_rate * 2 // 10
            audio_chunks = (
                raw_audio[offset : offset + bytes_per_chunk]
                for offset in range(0, len(raw_audio), bytes_per_chunk)
            )
            responses = (self._service or self._build_service()).streaming_response_generator(
                audio_chunks,
                streaming_config,
            )
            transcript = " ".join(
                result.alternatives[0].transcript
                for response in responses
                for result in response.results
                if result.alternatives and result.is_final
            ).strip()
        except RuntimeError:
            raise
        except Exception as exc:
            raise RuntimeError(f"NVIDIA speech recognition failed: {exc}") from exc

        if not transcript:
            raise RuntimeError("NVIDIA speech recognition returned no transcript.")
        return TranscriptionResult(text=transcript, provider=self.name, model=self.model, language="en-US")
