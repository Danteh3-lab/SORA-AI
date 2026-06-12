import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from sora_assistant.assistant_core.service import AssistantService
from sora_assistant.api.app import create_app
from sora_assistant.config import AssistantConfig
from sora_assistant.memory.store import SQLiteAssistantStore
from sora_assistant.providers.fake import FakeLLMProvider, FakeSpeechToTextProvider, FakeTextToSpeechProvider
from sora_assistant.providers.registry import ProviderBundle


class ApiOptionalTests(unittest.TestCase):
    def test_create_app_when_fastapi_is_installed(self):
        try:
            from fastapi.testclient import TestClient
        except ImportError:
            self.skipTest("fastapi is not installed")

        with tempfile.TemporaryDirectory() as tmp:
            config = AssistantConfig(
                provider="fake",
                data_dir=Path(tmp),
                llm_model="fake-llm",
                stt_model="fake-stt",
                tts_model="fake-tts",
                tts_voice="fake",
                wake_word_enabled=False,
                wake_word="jarvis",
            )
            providers = ProviderBundle(FakeLLMProvider(), FakeSpeechToTextProvider(), FakeTextToSpeechProvider())
            service = AssistantService(config, providers, SQLiteAssistantStore(Path(tmp) / "assistant.sqlite3"))
            client = TestClient(create_app(service))
            response = client.post("/chat/text", json={"message": "hello"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["assistant_text"], "I heard you say: hello")

    def test_voice_upload_reaches_service(self):
        try:
            from fastapi.testclient import TestClient
        except ImportError:
            self.skipTest("fastapi is not installed")

        with tempfile.TemporaryDirectory() as tmp:
            config = AssistantConfig(
                provider="fake",
                data_dir=Path(tmp),
                llm_model="fake-llm",
                stt_model="fake-stt",
                tts_model="fake-tts",
                tts_voice="fake",
                wake_word_enabled=False,
                wake_word="jarvis",
            )
            providers = ProviderBundle(
                FakeLLMProvider(),
                FakeSpeechToTextProvider(transcript="hello jarvis"),
                FakeTextToSpeechProvider(),
            )
            service = AssistantService(config, providers, SQLiteAssistantStore(Path(tmp) / "assistant.sqlite3"))
            client = TestClient(create_app(service))
            response = client.post(
                "/chat/voice",
                files={"file": ("voice.wav", b"audio", "audio/wav")},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user_text"], "hello jarvis")
        self.assertEqual(response.json()["audio"]["mime_type"], "text/plain")

    def test_settings_get_and_put_are_redacted_and_reconfigure_service(self):
        try:
            from fastapi.testclient import TestClient
        except ImportError:
            self.skipTest("fastapi is not installed")

        with tempfile.TemporaryDirectory() as tmp:
            config = AssistantConfig(
                provider="fake",
                data_dir=Path(tmp),
                llm_model="fake-llm",
                stt_model="fake-stt",
                tts_model="fake-tts",
                tts_voice="fake",
                wake_word_enabled=False,
                wake_word="jarvis",
            )
            providers = ProviderBundle(FakeLLMProvider(), FakeSpeechToTextProvider(), FakeTextToSpeechProvider())
            service = AssistantService(config, providers, SQLiteAssistantStore(Path(tmp) / "assistant.sqlite3"))
            client = TestClient(create_app(service))

            with patch.object(AssistantConfig, "save_non_secret_settings"):
                response = client.put(
                    "/settings",
                    json={
                        "llm_provider": "fake",
                        "stt_provider": "fake",
                        "tts_provider": "fake",
                        "llm_model": "new-fake-llm",
                        "stt_model": "fake-stt",
                        "tts_model": "fake-tts",
                        "tts_voice": "fake",
                        "openai_base_url": "",
                        "nvidia_base_url": "https://integrate.api.nvidia.com/v1",
                        "elevenlabs_base_url": "https://api.elevenlabs.io/v1",
                        "openai_api_key": "",
                        "nvidia_api_key": "",
                        "elevenlabs_api_key": "",
                    },
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["llm_model"], "new-fake-llm")
        self.assertNotIn("openai_api_key", response.json())
        self.assertNotIn("nvidia_api_key", response.json())
        self.assertNotIn("elevenlabs_api_key", response.json())
        self.assertEqual(service.config.llm_model, "new-fake-llm")

    def test_missing_nvidia_key_returns_clear_chat_error(self):
        try:
            from fastapi.testclient import TestClient
        except ImportError:
            self.skipTest("fastapi is not installed")

        with tempfile.TemporaryDirectory() as tmp:
            config = AssistantConfig(
                provider="fake",
                data_dir=Path(tmp),
                llm_model="meta/test",
                stt_model="fake-stt",
                tts_model="fake-tts",
                tts_voice="fake",
                wake_word_enabled=False,
                wake_word="jarvis",
                llm_provider="nvidia_nim",
                stt_provider="fake",
                tts_provider="fake",
            )
            with patch("sora_assistant.providers.nvidia_nim_provider.ApiKeyStore.get_api_key", return_value=None):
                service = AssistantService(config)
                client = TestClient(create_app(service))
                response = client.post("/chat/text", json={"message": "hello"})

        self.assertEqual(response.status_code, 503)
        self.assertIn("Missing NVIDIA_API_KEY", response.json()["detail"])

    def test_settings_writes_are_disabled_by_default_on_railway(self):
        try:
            from fastapi.testclient import TestClient
        except ImportError:
            self.skipTest("fastapi is not installed")

        with tempfile.TemporaryDirectory() as tmp:
            config = AssistantConfig(
                provider="fake",
                data_dir=Path(tmp),
                llm_model="fake-llm",
                stt_model="fake-stt",
                tts_model="fake-tts",
                tts_voice="fake",
                wake_word_enabled=False,
                wake_word="jarvis",
            )
            providers = ProviderBundle(FakeLLMProvider(), FakeSpeechToTextProvider(), FakeTextToSpeechProvider())
            service = AssistantService(config, providers, SQLiteAssistantStore(Path(tmp) / "assistant.sqlite3"))
            with patch.dict("os.environ", {"RAILWAY_ENVIRONMENT": "production"}, clear=True):
                client = TestClient(create_app(service))
                settings = client.get("/settings")
                response = client.put(
                    "/settings",
                    json={
                        "llm_provider": "fake",
                        "stt_provider": "fake",
                        "tts_provider": "fake",
                        "llm_model": "fake-llm",
                        "stt_model": "fake-stt",
                        "tts_model": "fake-tts",
                        "tts_voice": "fake",
                        "openai_base_url": "",
                        "nvidia_base_url": "https://integrate.api.nvidia.com/v1",
                        "elevenlabs_base_url": "https://api.elevenlabs.io/v1",
                    },
                )

        self.assertFalse(settings.json()["settings_writes_enabled"])
        self.assertEqual(response.status_code, 403)

    def test_settings_password_unlocks_railway_settings_writes(self):
        try:
            from fastapi.testclient import TestClient
        except ImportError:
            self.skipTest("fastapi is not installed")

        with tempfile.TemporaryDirectory() as tmp:
            config = AssistantConfig(
                provider="fake",
                data_dir=Path(tmp),
                llm_model="fake-llm",
                stt_model="fake-stt",
                tts_model="fake-tts",
                tts_voice="fake",
                wake_word_enabled=False,
                wake_word="jarvis",
            )
            providers = ProviderBundle(FakeLLMProvider(), FakeSpeechToTextProvider(), FakeTextToSpeechProvider())
            service = AssistantService(config, providers, SQLiteAssistantStore(Path(tmp) / "assistant.sqlite3"))
            with patch.dict(
                "os.environ",
                {"RAILWAY_ENVIRONMENT": "production", "SORA_SETTINGS_PASSWORD": "let-me-in"},
                clear=True,
            ):
                client = TestClient(create_app(service))
                settings = client.get("/settings")
                denied = client.put(
                    "/settings",
                    json={
                        "llm_provider": "fake",
                        "stt_provider": "fake",
                        "tts_provider": "fake",
                        "llm_model": "fake-llm",
                        "stt_model": "fake-stt",
                        "tts_model": "fake-tts",
                        "tts_voice": "fake",
                        "openai_base_url": "",
                        "nvidia_base_url": "https://integrate.api.nvidia.com/v1",
                        "elevenlabs_base_url": "https://api.elevenlabs.io/v1",
                        "settings_password": "wrong",
                    },
                )
                with patch.object(AssistantConfig, "save_non_secret_settings"):
                    allowed = client.put(
                        "/settings",
                        json={
                            "llm_provider": "fake",
                            "stt_provider": "fake",
                            "tts_provider": "fake",
                            "llm_model": "fake-llm",
                            "stt_model": "fake-stt",
                            "tts_model": "fake-tts",
                            "tts_voice": "new-voice",
                            "openai_base_url": "",
                            "nvidia_base_url": "https://integrate.api.nvidia.com/v1",
                            "elevenlabs_base_url": "https://api.elevenlabs.io/v1",
                            "settings_password": "let-me-in",
                        },
                    )

        self.assertTrue(settings.json()["settings_writes_enabled"])
        self.assertTrue(settings.json()["settings_password_required"])
        self.assertEqual(denied.status_code, 401)
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(service.config.tts_voice, "new-voice")


if __name__ == "__main__":
    unittest.main()
