from __future__ import annotations

import asyncio
import logging
import os
import re
import tempfile
import wave
from collections import defaultdict
from dataclasses import dataclass
from io import BytesIO
from typing import TYPE_CHECKING

from sora_assistant.assistant_core.service import AssistantService

if TYPE_CHECKING:
    import discord
    from discord.ext import commands


LOGGER = logging.getLogger(__name__)
DISCORD_MESSAGE_LIMIT = 1900
DEFAULT_AUTO_REPLY_CHANNEL_NAMES = frozenset({"danteh", "danteh-chat"})
DISCORD_PCM_SAMPLE_RATE = 48000
DISCORD_PCM_CHANNELS = 2
DISCORD_PCM_SAMPLE_WIDTH = 2
NVIDIA_ASR_SAMPLE_RATE = 16000
MINIMUM_UTTERANCE_BYTES = DISCORD_PCM_SAMPLE_RATE * DISCORD_PCM_CHANNELS * DISCORD_PCM_SAMPLE_WIDTH // 2
VOICE_UTTERANCE_SILENCE_SECONDS = 0.8
VOICE_UTTERANCE_SILENCE_PACKETS = int(VOICE_UTTERANCE_SILENCE_SECONDS / 0.02)
DISCORD_AUDIO_SUFFIXES = {
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/opus": ".opus",
}


@dataclass
class VoiceDebugState:
    listening: bool = False
    utterances_seen: int = 0
    flush_attempts: int = 0
    packets_seen: int = 0
    unresolved_packets: int = 0
    buffered_pcm_bytes: int = 0
    connected: bool = False
    current_channel: str = ""
    self_deaf: bool = False
    self_mute: bool = False
    last_pcm_bytes: int = 0
    last_transcript: str = ""
    last_error: str = ""
    last_reply_preview: str = ""


def _parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def build_discord_session_id(
    guild_id: int | None,
    channel_id: int | None,
    user_id: int,
) -> str:
    guild_part = str(guild_id) if guild_id is not None else "dm"
    channel_part = str(channel_id) if channel_id is not None else "dm"
    return f"discord:{guild_part}:{channel_part}:{user_id}"


def parse_csv_set(value: str | None) -> set[str]:
    if not value:
        return set()
    return {item.strip() for item in value.split(",") if item.strip()}


def normalize_channel_name(name: str | None) -> str:
    return (name or "").strip().lower()


def should_auto_reply_in_channel(
    *,
    channel_id: int | None,
    channel_name: str | None,
    configured_channel_ids: set[int],
    configured_channel_names: set[str],
) -> bool:
    if channel_id is not None and channel_id in configured_channel_ids:
        return True
    if normalize_channel_name(channel_name) in configured_channel_names:
        return True
    return False


def should_auto_reply_globally(value: str | None) -> bool:
    if value is None:
        return True
    return _parse_bool(value)


def audio_suffix_for_mime_type(mime_type: str | None) -> str | None:
    if not mime_type:
        return None
    normalized = mime_type.split(";", 1)[0].strip().lower()
    return DISCORD_AUDIO_SUFFIXES.get(normalized)


def pcm_stereo_to_mono(
    pcm_audio: bytes,
    *,
    sample_width: int = DISCORD_PCM_SAMPLE_WIDTH,
) -> bytes:
    try:
        import audioop
    except ImportError:
        import audioop_lts as audioop

    return audioop.tomono(pcm_audio, sample_width, 0.5, 0.5)


def pcm_resample(
    pcm_audio: bytes,
    *,
    from_rate: int,
    to_rate: int,
    sample_width: int = DISCORD_PCM_SAMPLE_WIDTH,
    channels: int = 1,
) -> bytes:
    if from_rate == to_rate:
        return pcm_audio

    try:
        import audioop
    except ImportError:
        import audioop_lts as audioop

    converted, _ = audioop.ratecv(pcm_audio, sample_width, channels, from_rate, to_rate, None)
    return converted


def pcm_to_wav_bytes(
    pcm_audio: bytes,
    *,
    sample_rate: int = DISCORD_PCM_SAMPLE_RATE,
    channels: int = DISCORD_PCM_CHANNELS,
    sample_width: int = DISCORD_PCM_SAMPLE_WIDTH,
) -> bytes:
    buffer = BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(sample_width)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_audio)
    return buffer.getvalue()


def chunk_discord_message(text: str, limit: int = DISCORD_MESSAGE_LIMIT) -> list[str]:
    clean_text = (text or "").strip()
    if not clean_text:
        return ["I am here, sir."]
    if len(clean_text) <= limit:
        return [clean_text]

    chunks: list[str] = []
    remaining = clean_text
    while remaining:
        if len(remaining) <= limit:
            chunks.append(remaining)
            break

        split_at = remaining.rfind("\n", 0, limit)
        if split_at < limit // 2:
            split_at = remaining.rfind(" ", 0, limit)
        if split_at < limit // 2:
            split_at = limit

        chunk = remaining[:split_at].strip()
        if not chunk:
            chunk = remaining[:limit].strip()
            split_at = len(chunk)
        chunks.append(chunk)
        remaining = remaining[split_at:].strip()

    return chunks


class DiscordBotRuntime:
    def __init__(
        self,
        service: AssistantService,
        token: str,
        guild_id: int | None = None,
        mention_replies_enabled: bool = True,
        auto_reply_all_channels: bool = True,
        auto_reply_channel_ids: set[int] | None = None,
        auto_reply_channel_names: set[str] | None = None,
        ffmpeg_path: str = "ffmpeg",
    ) -> None:
        try:
            import discord
            from discord import app_commands
            from discord.ext import commands
        except ImportError as exc:
            raise RuntimeError("discord.py is required when DISCORD_BOT_TOKEN is configured.") from exc

        intents = discord.Intents.default()
        intents.message_content = True

        self.service = service
        self.token = token
        self.guild_id = guild_id
        self.mention_replies_enabled = mention_replies_enabled
        self.auto_reply_all_channels = auto_reply_all_channels
        self.auto_reply_channel_ids = auto_reply_channel_ids or set()
        self.auto_reply_channel_names = auto_reply_channel_names or set(DEFAULT_AUTO_REPLY_CHANNEL_NAMES)
        self.ffmpeg_path = ffmpeg_path
        self._discord = discord
        self._app_commands = app_commands
        self.bot: commands.Bot = commands.Bot(command_prefix="!", intents=intents)
        self._task: asyncio.Task[None] | None = None
        self._ready = asyncio.Event()
        self._voice_reply_locks: dict[int, asyncio.Lock] = {}
        self._voice_sinks: dict[int, object] = {}
        self._voice_debug: dict[int, VoiceDebugState] = {}
        self._register_handlers()

    @classmethod
    def from_env(cls, service: AssistantService) -> "DiscordBotRuntime | None":
        token = os.environ.get("DISCORD_BOT_TOKEN", "").strip()
        if not token:
            return None

        guild_raw = os.environ.get("DISCORD_GUILD_ID", "").strip()
        guild_id = int(guild_raw) if guild_raw.isdigit() else None
        mention_replies_enabled = _parse_bool(os.environ.get("SORA_DISCORD_MENTION_REPLIES"), default=True)
        auto_reply_all_channels = should_auto_reply_globally(os.environ.get("SORA_DISCORD_AUTO_REPLY_ALL_CHANNELS"))
        auto_reply_channel_ids = {
            int(channel_id)
            for channel_id in parse_csv_set(os.environ.get("SORA_DISCORD_AUTO_REPLY_CHANNEL_IDS"))
            if channel_id.isdigit()
        }
        auto_reply_channel_names = {
            normalize_channel_name(name)
            for name in parse_csv_set(os.environ.get("SORA_DISCORD_AUTO_REPLY_CHANNEL_NAMES"))
        }
        ffmpeg_path = os.environ.get("SORA_DISCORD_FFMPEG_PATH", "ffmpeg").strip() or "ffmpeg"
        return cls(
            service=service,
            token=token,
            guild_id=guild_id,
            mention_replies_enabled=mention_replies_enabled,
            auto_reply_all_channels=auto_reply_all_channels,
            auto_reply_channel_ids=auto_reply_channel_ids,
            auto_reply_channel_names=auto_reply_channel_names,
            ffmpeg_path=ffmpeg_path,
        )

    def _register_handlers(self) -> None:
        discord = self._discord
        app_commands = self._app_commands
        bot = self.bot

        @bot.event
        async def on_ready() -> None:
            LOGGER.info("Discord bot ready as %s", bot.user)
            self._ready.set()

        @bot.event
        async def setup_hook() -> None:
            if self.guild_id is not None:
                guild = discord.Object(id=self.guild_id)
                bot.tree.copy_global_to(guild=guild)
                synced = await bot.tree.sync(guild=guild)
                LOGGER.info("Synced %s Discord guild command(s) to %s", len(synced), self.guild_id)
                return

            synced = await bot.tree.sync()
            LOGGER.info("Synced %s global Discord command(s)", len(synced))

        @bot.event
        async def on_message(message: discord.Message) -> None:
            if message.author.bot:
                return
            if bot.user is None:
                return

            is_mentioned = bot.user in message.mentions
            auto_reply_channel = self.auto_reply_all_channels or should_auto_reply_in_channel(
                channel_id=message.channel.id,
                channel_name=getattr(message.channel, "name", None),
                configured_channel_ids=self.auto_reply_channel_ids,
                configured_channel_names=self.auto_reply_channel_names,
            )

            if not is_mentioned and not auto_reply_channel:
                return
            if is_mentioned and not self.mention_replies_enabled and not auto_reply_channel:
                return

            prompt = re.sub(rf"<@!?{bot.user.id}>", "", message.content).strip() if is_mentioned else message.content.strip()
            if not prompt:
                if auto_reply_channel:
                    return
                await message.reply("I am listening, sir. Mention me with a request.", mention_author=False)
                return

            async with message.channel.typing():
                reply = await self._ask_service(
                    prompt,
                    user_id=message.author.id,
                    guild_id=message.guild.id if message.guild else None,
                    channel_id=message.channel.id,
                )

            chunks = chunk_discord_message(reply)
            if auto_reply_channel and not is_mentioned:
                await message.channel.send(chunks[0])
            else:
                await message.reply(chunks[0], mention_author=False)
            for chunk in chunks[1:]:
                await message.channel.send(chunk)

        @bot.tree.command(name="ask", description="Ask DANTEH for help")
        @app_commands.describe(prompt="What you want DANTEH to handle")
        async def ask(interaction: discord.Interaction, prompt: str) -> None:
            await interaction.response.defer(thinking=True)
            reply = await self._ask_service(
                prompt,
                user_id=interaction.user.id,
                guild_id=interaction.guild_id,
                channel_id=interaction.channel_id,
            )
            chunks = chunk_discord_message(reply)
            await interaction.followup.send(chunks[0])
            for chunk in chunks[1:]:
                await interaction.followup.send(chunk)

        @bot.tree.command(name="ping", description="Check whether DANTEH is online")
        async def ping(interaction: discord.Interaction) -> None:
            await interaction.response.send_message("Online and ready, sir.")

        @bot.tree.command(name="join", description="Join your current voice channel")
        async def join(interaction: discord.Interaction) -> None:
            await interaction.response.defer(thinking=True)
            try:
                voice_client = await self._join_user_voice_channel(interaction)
                self._ensure_voice_listening(voice_client)
            except RuntimeError as exc:
                await interaction.followup.send(str(exc))
                return
            await interaction.followup.send(f"Joined **{voice_client.channel.name}**, sir.")

        @bot.tree.command(name="leave", description="Leave the current voice channel")
        async def leave(interaction: discord.Interaction) -> None:
            guild = interaction.guild
            if guild is None:
                await interaction.response.send_message("This command only works inside a server.", ephemeral=True)
                return

            voice_client = guild.voice_client
            if voice_client is None:
                await interaction.response.send_message("I am not in a voice channel right now, sir.")
                return

            channel_name = getattr(voice_client.channel, "name", "voice")
            await voice_client.disconnect()
            await interaction.response.send_message(f"Left **{channel_name}**, sir.")

        @bot.tree.command(name="say", description="Speak a line in your current voice channel")
        @app_commands.describe(text="What DANTEH should say aloud")
        async def say(interaction: discord.Interaction, text: str) -> None:
            await interaction.response.defer(thinking=True)
            try:
                voice_client = await self._join_user_voice_channel(interaction)
                self._ensure_voice_listening(voice_client)
                await self._speak_text(voice_client, text)
            except RuntimeError as exc:
                await interaction.followup.send(str(exc))
                return
            await interaction.followup.send(f"Speaking in **{voice_client.channel.name}**, sir.")

        @bot.tree.command(name="voiceask", description="Ask DANTEH and hear the reply in voice")
        @app_commands.describe(prompt="What you want DANTEH to answer out loud")
        async def voiceask(interaction: discord.Interaction, prompt: str) -> None:
            await interaction.response.defer(thinking=True)
            try:
                voice_client = await self._join_user_voice_channel(interaction)
                self._ensure_voice_listening(voice_client)
                reply = await self._ask_service(
                    prompt,
                    user_id=interaction.user.id,
                    guild_id=interaction.guild_id,
                    channel_id=interaction.channel_id,
                )
                await self._speak_text(voice_client, reply)
            except RuntimeError as exc:
                await interaction.followup.send(str(exc))
                return

            chunks = chunk_discord_message(reply)
            await interaction.followup.send(chunks[0])
            for chunk in chunks[1:]:
                await interaction.followup.send(chunk)

        @bot.tree.command(name="voicecheck", description="Show Discord voice pipeline status")
        async def voicecheck(interaction: discord.Interaction) -> None:
            if interaction.guild_id is None:
                await interaction.response.send_message("This command only works inside a server.", ephemeral=True)
                return
            state = self._voice_debug.get(interaction.guild_id, VoiceDebugState())
            guild = interaction.guild
            bot_member = guild.me if guild is not None else None
            bot_voice = getattr(bot_member, "voice", None)
            if bot_voice is not None:
                state.connected = True
                state.current_channel = getattr(getattr(bot_voice, "channel", None), "name", "") or "(unknown)"
                state.self_deaf = bool(getattr(bot_voice, "self_deaf", False))
                state.self_mute = bool(getattr(bot_voice, "self_mute", False))
            else:
                state.connected = False
                state.current_channel = ""
                state.self_deaf = False
                state.self_mute = False
            details = [
                f"listening={state.listening}",
                f"connected={state.connected}",
                f"channel={state.current_channel or '(none)'}",
                f"self_deaf={state.self_deaf}",
                f"self_mute={state.self_mute}",
                f"utterances_seen={state.utterances_seen}",
                f"flush_attempts={state.flush_attempts}",
                f"packets_seen={state.packets_seen}",
                f"unresolved_packets={state.unresolved_packets}",
                f"buffered_pcm_bytes={state.buffered_pcm_bytes}",
                f"last_pcm_bytes={state.last_pcm_bytes}",
                f"last_transcript={state.last_transcript or '(none)'}",
                f"last_reply={state.last_reply_preview or '(none)'}",
                f"last_error={state.last_error or '(none)'}",
            ]
            await interaction.response.send_message("\n".join(details), ephemeral=True)

    async def _ask_service(
        self,
        prompt: str,
        *,
        user_id: int,
        guild_id: int | None,
        channel_id: int | None,
    ) -> str:
        session_id = build_discord_session_id(guild_id=guild_id, channel_id=channel_id, user_id=user_id)
        try:
            turn = await asyncio.to_thread(self.service.send_text, prompt, session_id)
        except (RuntimeError, ValueError) as exc:
            LOGGER.exception("Discord assistant request failed")
            return f"Backend request failed: {exc}"
        return turn.assistant_text.strip() or "I am here, sir."

    async def _join_user_voice_channel(self, interaction) -> "discord.VoiceClient":
        try:
            from discord.ext import voice_recv
        except ImportError as exc:
            raise RuntimeError("discord-ext-voice-recv is required for Discord voice conversations.") from exc

        guild = interaction.guild
        if guild is None:
            raise RuntimeError("Voice commands only work inside a server, sir.")

        member_voice = getattr(interaction.user, "voice", None)
        target_channel = getattr(member_voice, "channel", None)
        if target_channel is None:
            raise RuntimeError("Join a voice channel first, sir.")

        voice_client = guild.voice_client
        try:
            if voice_client is None:
                voice_client = await target_channel.connect(
                    cls=voice_recv.VoiceRecvClient,
                    timeout=20.0,
                    reconnect=True,
                    self_deaf=False,
                    self_mute=False,
                )
            elif not hasattr(voice_client, "listen"):
                await voice_client.disconnect()
                voice_client = await target_channel.connect(
                    cls=voice_recv.VoiceRecvClient,
                    timeout=20.0,
                    reconnect=True,
                    self_deaf=False,
                    self_mute=False,
                )
            elif voice_client.channel.id != target_channel.id:
                await voice_client.move_to(target_channel)
            await guild.change_voice_state(channel=target_channel, self_deaf=False, self_mute=False)
        except Exception as exc:
            raise RuntimeError(f"Discord voice connection failed: {exc}") from exc

        debug = self._voice_debug.setdefault(guild.id, VoiceDebugState())
        bot_voice = getattr(guild.me, "voice", None)
        debug.connected = bot_voice is not None
        debug.current_channel = getattr(getattr(bot_voice, "channel", None), "name", "") or ""
        debug.self_deaf = bool(getattr(bot_voice, "self_deaf", False)) if bot_voice is not None else False
        debug.self_mute = bool(getattr(bot_voice, "self_mute", False)) if bot_voice is not None else False
        return voice_client

    def _ensure_voice_listening(self, voice_client) -> None:
        try:
            from discord.ext import voice_recv
        except ImportError as exc:
            raise RuntimeError("discord-ext-voice-recv is required for Discord voice conversations.") from exc

        if not hasattr(voice_client, "listen"):
            raise RuntimeError("This Discord voice client does not support voice receive.")
        if voice_client.is_listening():
            self._voice_debug.setdefault(voice_client.guild.id, VoiceDebugState()).listening = True
            return

        sink = voice_recv.SilenceGeneratorSink(build_voice_conversation_sink(self, voice_client.guild.id))
        self._voice_sinks[voice_client.guild.id] = sink
        voice_client.listen(sink)
        self._voice_debug.setdefault(voice_client.guild.id, VoiceDebugState()).listening = True
        LOGGER.info("Discord voice listening armed for guild %s", voice_client.guild.id)

    async def _speak_text(self, voice_client: "discord.VoiceClient", text: str) -> None:
        if voice_client.is_playing():
            raise RuntimeError("I am already speaking in voice, sir.")

        try:
            audio_result = await asyncio.to_thread(self.service.providers.tts.speak, text)
        except (RuntimeError, ValueError) as exc:
            raise RuntimeError(str(exc)) from exc

        suffix = audio_suffix_for_mime_type(audio_result.mime_type)
        if suffix is None:
            raise RuntimeError(
                "The configured TTS provider cannot be streamed to Discord voice. Use a server-side audio provider such as OpenAI TTS."
            )

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_audio:
            temp_audio.write(audio_result.audio)
            temp_path = temp_audio.name

        loop = asyncio.get_running_loop()
        done: asyncio.Future[None] = loop.create_future()
        source = None

        def after_playback(error):
            try:
                os.unlink(temp_path)
            except OSError:
                pass

            if done.done():
                return
            if error is not None:
                loop.call_soon_threadsafe(done.set_exception, RuntimeError(f"Discord voice playback failed: {error}"))
            else:
                loop.call_soon_threadsafe(done.set_result, None)

        try:
            source = self._discord.FFmpegPCMAudio(temp_path, executable=self.ffmpeg_path)
            voice_client.play(source, after=after_playback)
        except Exception as exc:
            try:
                os.unlink(temp_path)
            except OSError:
                pass
            raise RuntimeError(f"Discord voice playback setup failed: {exc}") from exc

        await done

    async def _handle_voice_utterance(
        self,
        *,
        guild_id: int,
        channel_id: int,
        user_id: int,
        pcm_audio: bytes,
        voice_client,
    ) -> None:
        debug = self._voice_debug.setdefault(guild_id, VoiceDebugState())
        debug.utterances_seen += 1
        debug.last_pcm_bytes = len(pcm_audio)
        debug.last_error = ""
        LOGGER.info("Discord voice utterance captured for guild %s with %s PCM bytes", guild_id, len(pcm_audio))
        if len(pcm_audio) < MINIMUM_UTTERANCE_BYTES:
            debug.last_error = f"Utterance below threshold: {len(pcm_audio)} bytes"
            LOGGER.info("Ignoring short Discord utterance for guild %s: %s bytes", guild_id, len(pcm_audio))
            return

        lock = self._voice_reply_locks.setdefault(guild_id, asyncio.Lock())
        async with lock:
            mono_audio = pcm_stereo_to_mono(pcm_audio)
            resampled_audio = pcm_resample(
                mono_audio,
                from_rate=DISCORD_PCM_SAMPLE_RATE,
                to_rate=NVIDIA_ASR_SAMPLE_RATE,
                sample_width=DISCORD_PCM_SAMPLE_WIDTH,
                channels=1,
            )
            wav_audio = pcm_to_wav_bytes(
                resampled_audio,
                sample_rate=NVIDIA_ASR_SAMPLE_RATE,
                channels=1,
                sample_width=DISCORD_PCM_SAMPLE_WIDTH,
            )
            try:
                transcription = await asyncio.to_thread(
                    self.service.providers.stt.transcribe,
                    wav_audio,
                    "discord-voice.wav",
                )
            except (RuntimeError, ValueError) as exc:
                debug.last_error = str(exc)
                LOGGER.warning("Discord voice transcription failed: %s", exc)
                return

            prompt = transcription.text.strip()
            debug.last_transcript = prompt
            LOGGER.info("Discord voice transcript for guild %s: %s", guild_id, prompt)
            if not prompt:
                debug.last_error = "Empty transcript returned by STT provider."
                return

            reply = await self._ask_service(
                prompt,
                user_id=user_id,
                guild_id=guild_id,
                channel_id=channel_id,
            )
            debug.last_reply_preview = reply[:160]
            try:
                await self._speak_text(voice_client, reply)
            except RuntimeError as exc:
                debug.last_error = str(exc)
                LOGGER.warning("Discord voice reply failed: %s", exc)

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self.bot.start(self.token), name="discord-bot")

    async def close(self) -> None:
        if self._task is None:
            return
        await self.bot.close()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None


def build_voice_conversation_sink(runtime: DiscordBotRuntime, guild_id: int):
    try:
        from discord.ext import voice_recv
    except ImportError as exc:
        raise RuntimeError("discord-ext-voice-recv is required for Discord voice conversations.") from exc

    event_loop = runtime.bot.loop

    class Sink(voice_recv.AudioSink):
        def __init__(self) -> None:
            super().__init__()
            self._buffers: dict[int, bytearray] = defaultdict(bytearray)
            self._silence_packets: dict[int, int] = defaultdict(int)
            self._flush_handles: dict[int, asyncio.TimerHandle] = {}

        def _update_buffer_debug(self) -> None:
            debug = runtime._voice_debug.setdefault(guild_id, VoiceDebugState())
            debug.buffered_pcm_bytes = sum(len(buffer) for buffer in self._buffers.values())

        def _cancel_flush_handle(self, user_id: int) -> None:
            handle = self._flush_handles.pop(user_id, None)
            if handle is not None:
                handle.cancel()

        def _reschedule_flush_on_loop(self, user_id: int) -> None:
            self._cancel_flush_handle(user_id)
            self._flush_handles[user_id] = event_loop.call_later(
                VOICE_UTTERANCE_SILENCE_SECONDS,
                self._dispatch_utterance,
                user_id,
            )

        def _schedule_flush_handle(self, user_id: int) -> None:
            event_loop.call_soon_threadsafe(self._reschedule_flush_on_loop, user_id)

        def _resolve_user_id(self, *, user=None, packet=None, member=None, ssrc=None) -> int | None:
            if user is not None and getattr(user, "id", None) is not None:
                return user.id
            if member is not None and getattr(member, "id", None) is not None:
                return member.id
            voice_client = self.voice_client
            if voice_client is None:
                return None
            resolved_ssrc = ssrc
            if resolved_ssrc is None and packet is not None:
                resolved_ssrc = getattr(packet, "ssrc", None)
            if resolved_ssrc is None:
                return None
            return voice_client._get_id_from_ssrc(resolved_ssrc)

        def _dispatch_utterance(self, user_id: int | None) -> None:
            if user_id is None:
                return

            self._cancel_flush_handle(user_id)
            debug = runtime._voice_debug.setdefault(guild_id, VoiceDebugState())
            debug.flush_attempts += 1
            pcm_audio = bytes(self._buffers.pop(user_id, b""))
            self._silence_packets.pop(user_id, None)
            self._update_buffer_debug()
            if not pcm_audio:
                return

            voice_client = self.voice_client
            if voice_client is None:
                return

            event_loop.call_soon_threadsafe(
                lambda: asyncio.create_task(
                    runtime._handle_voice_utterance(
                        guild_id=guild_id,
                        channel_id=voice_client.channel.id,
                        user_id=user_id,
                        pcm_audio=pcm_audio,
                        voice_client=voice_client,
                    )
                )
            )

        def wants_opus(self) -> bool:
            return False

        def write(self, user, data) -> None:
            voice_client = self.voice_client
            if voice_client is None:
                return
            user_id = self._resolve_user_id(user=user, packet=data.packet)
            if user_id == voice_client.guild.me.id:
                return
            debug = runtime._voice_debug.setdefault(guild_id, VoiceDebugState())
            debug.packets_seen += 1
            if user_id is None:
                debug.unresolved_packets += 1
                return
            if user is not None and getattr(user, "bot", False):
                return
            if isinstance(data.packet, voice_recv.SilencePacket):
                if not self._buffers.get(user_id):
                    return
                self._silence_packets[user_id] += 1
                if self._silence_packets[user_id] >= VOICE_UTTERANCE_SILENCE_PACKETS:
                    self._dispatch_utterance(user_id)
                return

            self._silence_packets[user_id] = 0
            if data.pcm:
                self._buffers[user_id].extend(data.pcm)
                self._update_buffer_debug()
                self._schedule_flush_handle(user_id)

        @voice_recv.AudioSink.listener()
        def on_voice_member_speaking_stop(self, member) -> None:
            if getattr(member, "bot", False):
                return
            self._dispatch_utterance(self._resolve_user_id(member=member))

        @voice_recv.AudioSink.listener()
        def on_voice_member_disconnect(self, member, ssrc) -> None:
            if getattr(member, "bot", False):
                return
            self._dispatch_utterance(self._resolve_user_id(member=member, ssrc=ssrc))

        def cleanup(self) -> None:
            for user_id in tuple(self._flush_handles.keys()):
                self._cancel_flush_handle(user_id)
            self._buffers.clear()
            self._silence_packets.clear()
            self._update_buffer_debug()

    return Sink()
