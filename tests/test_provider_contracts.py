import unittest

from sora_assistant.models import Message
from sora_assistant.providers.fake import FakeLLMProvider, FakeSpeechToTextProvider, FakeTextToSpeechProvider


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


if __name__ == "__main__":
    unittest.main()

