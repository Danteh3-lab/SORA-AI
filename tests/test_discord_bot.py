import unittest

from sora_assistant.discord_bot import build_discord_session_id, chunk_discord_message


class DiscordBotHelpersTests(unittest.TestCase):
    def test_build_session_id_includes_guild_channel_and_user(self):
        session_id = build_discord_session_id(guild_id=42, channel_id=99, user_id=7)
        self.assertEqual(session_id, "discord:42:99:7")

    def test_build_session_id_uses_dm_markers_without_guild_or_channel(self):
        session_id = build_discord_session_id(guild_id=None, channel_id=None, user_id=7)
        self.assertEqual(session_id, "discord:dm:dm:7")

    def test_chunk_discord_message_splits_long_text(self):
        text = "alpha " * 500
        chunks = chunk_discord_message(text, limit=120)

        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(chunk) <= 120 for chunk in chunks))
        self.assertEqual(" ".join(chunk.strip() for chunk in chunks).replace("  ", " ").strip(), text.strip())

    def test_chunk_discord_message_returns_default_for_blank_text(self):
        self.assertEqual(chunk_discord_message("   "), ["I am here, sir."])


if __name__ == "__main__":
    unittest.main()
