import unittest
import wave
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from sora_assistant.config import AssistantConfig
from sora_assistant.models import Message
from sora_assistant.providers.fake import (
    BrowserTextToSpeechProvider,
    FakeLLMProvider,
    FakeSpeechToTextProvider,
    FakeTextToSpeechProvider,
)
from sora_assistant.providers.elevenlabs_provider import ElevenLabsTextToSpeechProvider
from sora_assistant.providers.nvidia_nim_provider import NvidiaNimLLMProvider
from sora_assistant.providers.nvidia_speech_provider import NvidiaSpeechToTextProvider
from sora_assistant.providers.registry import build_provider_bundle


class ProviderContractTests(unittest.TestCase):
    def test_fake_llm_contract(self):
        response = FakeLLMProvider().generate([Message(role="user", content="ping")])
        self.assertEqual(response.provider, "fake")
        self.assertIn("ping", response.text)

    def test_fake_stt_contract(self):
        response = FakeSpeechToTextProvider(transcript="hello").transcribe(b"audio")
        self.assertEqual(response.text, "hello")

    def test_fake_tts_contract(self):
        response = FakeTextToSpeechProvider().speak("hello")
        self.assertEqual(response.audio, b"hello")

    def test_browser_tts_returns_text_for_client_speech(self):
        response = BrowserTextToSpeechProvider().speak("hello")

        self.assertEqual(response.audio, b"hello")
        self.assertEqual(response.provider, "browser")
        self.assertEqual(response.mime_type, "text/plain")

    def test_elevenlabs_tts_maps_audio_response(self):
        captured = {}

        class Response:
            content = b"mp3-bytes"

            def raise_for_status(self):
                return None

        class Client:
            def post(self, url, headers, json, timeout):
                captured["url"] = url
                captured["headers"] = headers
                captured["json"] = json
                captured["timeout"] = timeout
                return Response()

        config = self._config(
            tts_provider="elevenlabs",
            tts_model="eleven_flash_v2_5",
            tts_voice="voice123",
            elevenlabs_base_url="https://api.elevenlabs.io/v1",
        )
        with patch("sora_assistant.providers.elevenlabs_provider.ApiKeyStore.get_api_key", return_value="eleven-key"):
            response = ElevenLabsTextToSpeechProvider(config, client=Client()).speak("Welcome back, sir.")

        self.assertEqual(response.audio, b"mp3-bytes")
        self.assertEqual(response.provider, "elevenlabs")
        self.assertEqual(response.mime_type, "audio/mpeg")
        self.assertEqual(captured["json"]["model_id"], "eleven_flash_v2_5")
        self.assertEqual(captured["url"], "https://api.elevenlabs.io/v1/text-to-speech/voice123?output_format=mp3_44100_128")

    def test_elevenlabs_tts_requires_api_key(self):
        config = self._config(tts_provider="elevenlabs", tts_model="eleven_flash_v2_5", tts_voice="voice123")

        with patch("sora_assistant.providers.elevenlabs_provider.ApiKeyStore.get_api_key", return_value=None):
            with self.assertRaisesRegex(RuntimeError, "Missing ELEVENLABS_API_KEY"):
                ElevenLabsTextToSpeechProvider(config, client=object()).speak("hello")

    def test_nvidia_nim_llm_maps_chat_completion_response(self):
        captured = {}

        class Completions:
            def create(self, **kwargs):
                captured.update(kwargs)
                return SimpleNamespace(
                    choices=[
                        SimpleNamespace(
                            message=SimpleNamespace(content="NIM response", reasoning_content="reasoning trace"),
                        )
                    ],
                    model="meta/test",
                )

        class Client:
            chat = SimpleNamespace(completions=Completions())

        client = Client()
        config = self._config(llm_provider="nvidia_nim", llm_model="meta/test")
        response = NvidiaNimLLMProvider(config, client=client).generate(
            [Message(role="user", content="ping")]
        )

        self.assertEqual(response.text, "NIM response")
        self.assertEqual(response.provider, "nvidia_nim")
        self.assertEqual(response.raw["reasoning_content"], "reasoning trace")
        self.assertEqual(captured["model"], "meta/test")
        self.assertEqual(captured["messages"][-1]["content"], "ping")
        self.assertEqual(captured["temperature"], 0.60)
        self.assertEqual(captured["max_tokens"], 2048)
        self.assertEqual(captured["extra_body"]["reasoning_budget"], 1024)

    def test_nvidia_nim_llm_wraps_provider_errors(self):
        class Completions:
            def create(self, **kwargs):
                raise ValueError("invalid credential")

        client = SimpleNamespace(chat=SimpleNamespace(completions=Completions()))
        config = self._config(llm_provider="nvidia_nim", llm_model="meta/test")

        with self.assertRaisesRegex(RuntimeError, "NVIDIA NIM request failed"):
            NvidiaNimLLMProvider(config, client=client).generate([Message(role="user", content="ping")])

    def test_nvidia_speech_maps_riva_transcript(self):
        captured = {}

        class Service:
            def streaming_response_generator(self, audio_chunks, config):
                captured["audio"] = b"".join(audio_chunks)
                captured["sample_rate"] = config.config.sample_rate_hertz
                return [
                    SimpleNamespace(
                        results=[
                            SimpleNamespace(
                                alternatives=[SimpleNamespace(transcript="Hello, Jarvis.")],
                                is_final=True,
                            )
                        ]
                    )
                ]

        wav_audio = BytesIO()
        with wave.open(wav_audio, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(16000)
            wav_file.writeframes(b"\x00\x00" * 160)

        config = self._config(stt_provider="nvidia_nim", stt_model="nvidia/nemotron-asr-streaming")
        response = NvidiaSpeechToTextProvider(config, service=Service()).transcribe(wav_audio.getvalue())

        self.assertEqual(response.text, "Hello, Jarvis.")
        self.assertEqual(response.provider, "nvidia_nim")
        self.assertEqual(captured["sample_rate"], 16000)
        self.assertEqual(captured["audio"], b"\x00\x00" * 160)

    def test_registry_builds_capability_specific_bundle(self):
        config = self._config(llm_provider="fake", stt_provider="fake", tts_provider="fake")
        bundle = build_provider_bundle(config)

        self.assertIsInstance(bundle.llm, FakeLLMProvider)
        self.assertIsInstance(bundle.stt, FakeSpeechToTextProvider)
        self.assertIsInstance(bundle.tts, FakeTextToSpeechProvider)

    def test_registry_builds_nvidia_hearing_and_browser_voice(self):
        config = self._config(
            llm_provider="nvidia_nim",
            stt_provider="nvidia_nim",
            tts_provider="browser",
        )
        bundle = build_provider_bundle(config)

        self.assertIsInstance(bundle.llm, NvidiaNimLLMProvider)
        self.assertIsInstance(bundle.stt, NvidiaSpeechToTextProvider)
        self.assertIsInstance(bundle.tts, BrowserTextToSpeechProvider)

    def test_registry_builds_elevenlabs_voice(self):
        config = self._config(tts_provider="elevenlabs", tts_model="eleven_flash_v2_5", tts_voice="voice123")
        bundle = build_provider_bundle(config)

        self.assertIsInstance(bundle.tts, ElevenLabsTextToSpeechProvider)

    @staticmethod
    def _config(**overrides):
        values = {
            "provider": "fake",
            "data_dir": Path("."),
            "llm_model": "fake-llm",
            "stt_model": "fake-stt",
            "tts_model": "fake-tts",
            "tts_voice": "fake",
            "wake_word_enabled": False,
            "wake_word": "jarvis",
            "elevenlabs_base_url": "https://api.elevenlabs.io/v1",
        }
        values.update(overrides)
        return AssistantConfig(**values)


if __name__ == "__main__":
    unittest.main()
