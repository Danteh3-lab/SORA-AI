import tempfile
import unittest
from pathlib import Path

from sora_assistant.assistant_core.events import EventBus
from sora_assistant.assistant_core.service import AssistantService
from sora_assistant.config import AssistantConfig
from sora_assistant.memory.store import SQLiteAssistantStore
from sora_assistant.models import AssistantState
from sora_assistant.providers.fake import FakeLLMProvider, FakeSpeechToTextProvider, FakeTextToSpeechProvider
from sora_assistant.providers.registry import ProviderBundle


def make_service(tmp: str, transcript: str = "hello by voice") -> AssistantService:
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
        llm=FakeLLMProvider(),
        stt=FakeSpeechToTextProvider(transcript=transcript),
        tts=FakeTextToSpeechProvider(),
    )
    return AssistantService(
        config=config,
        providers=providers,
        store=SQLiteAssistantStore(Path(tmp) / "assistant.sqlite3"),
        events=EventBus(),
    )


class AssistantServiceTests(unittest.TestCase):
    def test_text_turn_uses_provider_and_persists_messages(self):
        with tempfile.TemporaryDirectory() as tmp:
            service = make_service(tmp)
            turn = service.send_text("hello")
            messages = service.store.list_messages(turn.session_id)

        self.assertEqual(turn.assistant_text, "I heard you say: hello")
        self.assertEqual([message.role for message in messages], ["user", "assistant"])
        self.assertEqual(turn.state_history, [AssistantState.THINKING, AssistantState.IDLE])

    def test_explicit_memory_command_saves_without_llm(self):
        with tempfile.TemporaryDirectory() as tmp:
            service = make_service(tmp)
            turn = service.send_text("Remember that I like quiet concise answers.")
            memories = service.search_memories("quiet")

        self.assertEqual(turn.assistant_text, "I'll remember that.")
        self.assertIsNotNone(turn.saved_memory)
        self.assertEqual(memories[0].tags, ["explicit"])

    def test_voice_turn_transcribes_answers_and_speaks(self):
        with tempfile.TemporaryDirectory() as tmp:
            service = make_service(tmp, transcript="testing voice")
            turn = service.send_voice(b"fake audio")

        self.assertEqual(turn.user_text, "testing voice")
        self.assertIsNotNone(turn.audio)
        self.assertEqual(turn.audio.audio, b"I heard you say: testing voice")
        self.assertIn(AssistantState.TRANSCRIBING, turn.state_history)
        self.assertIn(AssistantState.SPEAKING, turn.state_history)

    def test_event_order_for_text_turn(self):
        with tempfile.TemporaryDirectory() as tmp:
            service = make_service(tmp)
            service.send_text("hello")
            event_types = [event.type for event in service.events.history]

        self.assertEqual(
            event_types,
            ["state.changed", "assistant.response", "state.changed"],
        )


if __name__ == "__main__":
    unittest.main()

