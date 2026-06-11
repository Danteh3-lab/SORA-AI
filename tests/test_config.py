import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from sora_assistant.config import ApiKeyStore, AssistantConfig


class ConfigTests(unittest.TestCase):
    def test_loads_env_file_without_exposing_secrets(self):
        with tempfile.TemporaryDirectory() as tmp:
            env_file = Path(tmp) / ".env"
            env_file.write_text(
                "\n".join(
                    [
                        "SORA_PROVIDER=fake",
                        f"SORA_DATA_DIR={tmp}",
                        "SORA_LLM_MODEL=test-model",
                        "OPENAI_API_KEY=secret",
                    ]
                ),
                encoding="utf-8",
            )
            with patch.dict(os.environ, {}, clear=True):
                config = AssistantConfig.load(env_file)

        self.assertEqual(config.provider, "fake")
        self.assertEqual(config.resolved_llm_provider, "fake")
        self.assertEqual(config.llm_model, "test-model")
        self.assertNotIn("api_key", config.redacted())
        self.assertNotIn("secret", str(config.redacted()))

    def test_api_key_store_falls_back_to_environment(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "from-env"}, clear=True):
            store = ApiKeyStore()
            self.assertEqual(store.get_api_key("openai"), "from-env")

    def test_capability_providers_fall_back_to_legacy_provider(self):
        with patch.dict(os.environ, {"SORA_PROVIDER": "fake", "SORA_DATA_DIR": "."}, clear=True):
            config = AssistantConfig.load(Path("missing.env"))

        self.assertEqual(config.resolved_llm_provider, "fake")
        self.assertEqual(config.resolved_stt_provider, "fake")
        self.assertEqual(config.resolved_tts_provider, "fake")

    def test_non_secret_settings_round_trip_to_env_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            env_file = Path(tmp) / ".env"
            with patch.dict(os.environ, {"SORA_DATA_DIR": tmp}, clear=True):
                config = AssistantConfig.load(env_file).with_settings(
                    {
                        "llm_provider": "nvidia_nim",
                        "stt_provider": "fake",
                        "tts_provider": "fake",
                        "llm_model": "meta/test-model",
                        "nvidia_base_url": "http://localhost:9000/v1",
                    }
                )
                config.save_non_secret_settings(env_file)
                loaded = AssistantConfig.load(env_file)

        self.assertEqual(loaded.resolved_llm_provider, "nvidia_nim")
        self.assertEqual(loaded.resolved_stt_provider, "fake")
        self.assertEqual(loaded.llm_model, "meta/test-model")
        self.assertEqual(loaded.nvidia_base_url, "http://localhost:9000/v1")


if __name__ == "__main__":
    unittest.main()
