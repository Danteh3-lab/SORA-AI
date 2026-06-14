from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import TYPE_CHECKING

from sora_assistant.assistant_core.service import AssistantService

if TYPE_CHECKING:
    import discord
    from discord.ext import commands


LOGGER = logging.getLogger(__name__)
DISCORD_MESSAGE_LIMIT = 1900
DEFAULT_AUTO_REPLY_CHANNEL_NAMES = frozenset({"danteh", "danteh-chat"})


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
        auto_reply_channel_ids: set[int] | None = None,
        auto_reply_channel_names: set[str] | None = None,
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
        self.auto_reply_channel_ids = auto_reply_channel_ids or set()
        self.auto_reply_channel_names = auto_reply_channel_names or set(DEFAULT_AUTO_REPLY_CHANNEL_NAMES)
        self._discord = discord
        self._app_commands = app_commands
        self.bot: commands.Bot = commands.Bot(command_prefix="!", intents=intents)
        self._task: asyncio.Task[None] | None = None
        self._ready = asyncio.Event()
        self._register_handlers()

    @classmethod
    def from_env(cls, service: AssistantService) -> "DiscordBotRuntime | None":
        token = os.environ.get("DISCORD_BOT_TOKEN", "").strip()
        if not token:
            return None

        guild_raw = os.environ.get("DISCORD_GUILD_ID", "").strip()
        guild_id = int(guild_raw) if guild_raw.isdigit() else None
        mention_replies_enabled = _parse_bool(os.environ.get("SORA_DISCORD_MENTION_REPLIES"), default=True)
        auto_reply_channel_ids = {
            int(channel_id)
            for channel_id in parse_csv_set(os.environ.get("SORA_DISCORD_AUTO_REPLY_CHANNEL_IDS"))
            if channel_id.isdigit()
        }
        auto_reply_channel_names = {
            normalize_channel_name(name)
            for name in parse_csv_set(os.environ.get("SORA_DISCORD_AUTO_REPLY_CHANNEL_NAMES"))
        }
        return cls(
            service=service,
            token=token,
            guild_id=guild_id,
            mention_replies_enabled=mention_replies_enabled,
            auto_reply_channel_ids=auto_reply_channel_ids,
            auto_reply_channel_names=auto_reply_channel_names,
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
            auto_reply_channel = should_auto_reply_in_channel(
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
