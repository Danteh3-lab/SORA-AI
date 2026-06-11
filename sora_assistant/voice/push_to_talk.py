from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO


@dataclass(frozen=True)
class RecordedAudio:
    data: bytes
    filename: str = "push_to_talk.wav"
    mime_type: str = "audio/wav"


class PushToTalkRecorder:
    """Small optional recorder used by a future desktop frontend or CLI."""

    def __init__(self, sample_rate: int = 16_000, channels: int = 1) -> None:
        self.sample_rate = sample_rate
        self.channels = channels

    def record_seconds(self, seconds: float) -> RecordedAudio:
        try:
            import sounddevice as sd
            import soundfile as sf
        except ImportError as exc:
            raise RuntimeError("Install the voice extra to record microphone audio: pip install -e .[voice]") from exc

        audio = sd.rec(int(seconds * self.sample_rate), samplerate=self.sample_rate, channels=self.channels)
        sd.wait()

        buffer = BytesIO()
        sf.write(buffer, audio, self.sample_rate, format="WAV")
        return RecordedAudio(data=buffer.getvalue())

