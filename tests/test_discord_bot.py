import unittest

from sora_assistant.discord_bot import (
    audio_suffix_for_mime_type,
    build_discord_session_id,
    chunk_discord_message,
    normalize_channel_name,
    parse_csv_set,
    should_auto_reply_globally,
    should_auto_reply_in_channel,
)


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

    def test_parse_csv_set_ignores_empty_values(self):
        self.assertEqual(parse_csv_set(" danteh-chat, ,alerts "), {"danteh-chat", "alerts"})

    def test_normalize_channel_name_lowercases_and_strips(self):
        self.assertEqual(normalize_channel_name("  DANTEH-CHAT "), "danteh-chat")

    def test_auto_reply_channel_matches_by_id(self):
        self.assertTrue(
            should_auto_reply_in_channel(
                channel_id=42,
                channel_name="general",
                configured_channel_ids={42},
                configured_channel_names={"danteh-chat"},
            )
        )

    def test_auto_reply_channel_matches_by_name(self):
        self.assertTrue(
            should_auto_reply_in_channel(
                channel_id=7,
                channel_name="Danteh-Chat",
                configured_channel_ids=set(),
                configured_channel_names={"danteh-chat"},
            )
        )

    def test_auto_reply_channel_rejects_other_channels(self):
        self.assertFalse(
            should_auto_reply_in_channel(
                channel_id=7,
                channel_name="general",
                configured_channel_ids={42},
                configured_channel_names={"danteh-chat"},
            )
        )

    def test_global_auto_reply_defaults_to_enabled(self):
        self.assertTrue(should_auto_reply_globally(None))

    def test_global_auto_reply_can_be_disabled(self):
        self.assertFalse(should_auto_reply_globally("false"))

    def test_audio_suffix_for_mime_type_maps_mp3(self):
        self.assertEqual(audio_suffix_for_mime_type("audio/mpeg"), ".mp3")

    def test_audio_suffix_for_mime_type_rejects_text(self):
        self.assertIsNone(audio_suffix_for_mime_type("text/plain"))


if __name__ == "__main__":
    unittest.main()
