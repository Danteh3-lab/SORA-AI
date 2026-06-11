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
        self.assertEqual(config.llm_model, "test-model")
        self.assertNotIn("api_key", config.redacted())
        self.assertNotIn("secret", str(config.redacted()))

    def test_api_key_store_falls_back_to_environment(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "from-env"}, clear=True):
            store = ApiKeyStore()
            self.assertEqual(store.get_api_key("openai"), "from-env")


if __name__ == "__main__":
    unittest.main()

