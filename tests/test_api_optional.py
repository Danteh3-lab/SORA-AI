import tempfile
import unittest
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


if __name__ == "__main__":
    unittest.main()

