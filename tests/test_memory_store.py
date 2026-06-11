import tempfile
import unittest
from pathlib import Path

from sora_assistant.memory.store import SQLiteAssistantStore
from sora_assistant.models import Message


class MemoryStoreTests(unittest.TestCase):
    def test_memory_save_search_delete(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = SQLiteAssistantStore(Path(tmp) / "assistant.sqlite3")
            memory = store.save_memory("My favorite color is red", ["preference"])

            results = store.search_memories("color")
            self.assertEqual(len(results), 1)
            self.assertEqual(results[0].id, memory.id)
            self.assertEqual(results[0].tags, ["preference"])

            self.assertTrue(store.delete_memory(memory.id))
            self.assertEqual(store.search_memories("color"), [])

    def test_sessions_and_messages_persist(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "assistant.sqlite3"
            store = SQLiteAssistantStore(path)
            session = store.create_session("Test")
            store.add_message(session.id, Message(role="user", content="hello"))
            store.add_message(session.id, Message(role="assistant", content="hi"))

            reopened = SQLiteAssistantStore(path)
            messages = reopened.list_messages(session.id)
            sessions = reopened.list_sessions()

        self.assertEqual([message.content for message in messages], ["hello", "hi"])
        self.assertEqual(sessions[0].message_count, 2)


if __name__ == "__main__":
    unittest.main()

