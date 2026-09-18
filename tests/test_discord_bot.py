import unittest
import wave
from io import BytesIO

from sora_assistant.discord_bot import (
    audio_suffix_for_mime_type,
    build_discord_session_id,
    chunk_discord_message,
    is_name_triggered,
    normalize_channel_name,
    pcm_resample,
    pcm_stereo_to_mono,
    pcm_to_wav_bytes,
    parse_csv_set,
    should_auto_reply_globally,
    should_auto_reply_in_channel,
    strip_name_trigger,
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

    def test_name_trigger_matches_name_anywhere_case_insensitively(self):
        self.assertTrue(is_name_triggered("Danteh, are you there?"))
        self.assertTrue(is_name_triggered("hey DANTEH can you help?"))
        self.assertTrue(is_name_triggered("How are you, danteh?"))

    def test_name_trigger_does_not_match_name_inside_another_word_or_sentence(self):
        self.assertFalse(is_name_triggered("dantehbot, respond"))

    def test_strip_name_trigger_preserves_request(self):
        self.assertEqual(strip_name_trigger("Hey Danteh, what time is it?"), "what time is it?")
        self.assertEqual(strip_name_trigger("DANTEH help me"), "help me")
        self.assertEqual(strip_name_trigger("How are you, danteh?"), "How are you?")

    def test_global_auto_reply_defaults_to_enabled(self):
        self.assertTrue(should_auto_reply_globally(None))

    def test_global_auto_reply_can_be_disabled(self):
        self.assertFalse(should_auto_reply_globally("false"))

    def test_audio_suffix_for_mime_type_maps_mp3(self):
        self.assertEqual(audio_suffix_for_mime_type("audio/mpeg"), ".mp3")

    def test_audio_suffix_for_mime_type_rejects_text(self):
        self.assertIsNone(audio_suffix_for_mime_type("text/plain"))

    def test_pcm_stereo_to_mono_halves_frame_width(self):
        stereo_pcm = b"\x01\x00\x03\x00" * 50
        mono_pcm = pcm_stereo_to_mono(stereo_pcm)

        self.assertEqual(len(mono_pcm), len(stereo_pcm) // 2)

    def test_pcm_resample_reduces_length_for_lower_sample_rate(self):
        mono_pcm = b"\x01\x00" * 480
        resampled = pcm_resample(mono_pcm, from_rate=48000, to_rate=16000)

        self.assertLess(len(resampled), len(mono_pcm))

    def test_pcm_to_wav_bytes_wraps_raw_pcm_in_wav_container(self):
        wav_audio = pcm_to_wav_bytes(b"\x00\x00" * 100)

        with wave.open(BytesIO(wav_audio), "rb") as wav_file:
            self.assertEqual(wav_file.getnchannels(), 2)
            self.assertEqual(wav_file.getsampwidth(), 2)
            self.assertEqual(wav_file.getframerate(), 48000)
            self.assertEqual(len(wav_file.readframes(100)), 200)


if __name__ == "__main__":
    unittest.main()
