from __future__ import annotations

import re

from sora_assistant.assistant_core.events import EventBus
from sora_assistant.config import AssistantConfig
from sora_assistant.memory.store import SQLiteAssistantStore
from sora_assistant.models import AssistantState, AssistantTurn, Memory, Message
from sora_assistant.providers.registry import ProviderBundle, build_provider_bundle


SYSTEM_PROMPT = """You are a private local personal AI assistant inspired by the feel of a calm, capable lab assistant.
Be concise, practical, and conversational. Do not claim to control apps, files, messages, or the operating system.
Use stored memories only when they are relevant. Ask before storing new long-term memory unless the user explicitly says to remember something."""


MEMORY_PATTERNS = [
    re.compile(r"^\s*remember\s+that\s+(?P<memory>.+)$", re.IGNORECASE | re.DOTALL),
    re.compile(r"^\s*remember\s+(?P<memory>.+)$", re.IGNORECASE | re.DOTALL),
]


class AssistantService:
    def __init__(
        self,
        config: AssistantConfig,
        providers: ProviderBundle | None = None,
        store: SQLiteAssistantStore | None = None,
        events: EventBus | None = None,
    ) -> None:
        self.config = config
        self.providers = providers or build_provider_bundle(config)
        self.store = store or SQLiteAssistantStore(config.database_path)
        self.events = events or EventBus()
        self.state = AssistantState.IDLE

    def set_state(self, state: AssistantState, history: list[AssistantState]) -> None:
        self.state = state
        history.append(state)
        self.events.publish("state.changed", {"state": state.value})

    def reconfigure(self, config: AssistantConfig, providers: ProviderBundle | None = None) -> None:
        self.config = config
        self.providers = providers or build_provider_bundle(config)
        self.events.publish("settings.changed", config.redacted())

    def send_text(self, message: str, session_id: str | None = None) -> AssistantTurn:
        history: list[AssistantState] = []
        session = self.store.ensure_session(session_id)
        clean_message = message.strip()

        saved_memory = self._memory_from_command(clean_message)
        if saved_memory:
            self.store.add_message(session.id, Message(role="user", content=clean_message))
            self.store.add_message(session.id, Message(role="assistant", content="I'll remember that."))
            self.events.publish("memory.saved", {"id": saved_memory.id, "text": saved_memory.text})
            return AssistantTurn(
                session_id=session.id,
                user_text=clean_message,
                assistant_text="I'll remember that.",
                state_history=history,
                saved_memory=saved_memory,
            )

        self.set_state(AssistantState.THINKING, history)
        self.store.add_message(session.id, Message(role="user", content=clean_message))
        messages = self._build_context(session.id)
        response = self.providers.llm.generate(messages)
        self.store.add_message(session.id, Message(role="assistant", content=response.text))
        self.events.publish("assistant.response", {"session_id": session.id, "text": response.text})
        self.set_state(AssistantState.IDLE, history)
        return AssistantTurn(
            session_id=session.id,
            user_text=clean_message,
            assistant_text=response.text,
            state_history=history,
        )

    def send_voice(self, audio: bytes, session_id: str | None = None, filename: str = "audio.wav") -> AssistantTurn:
        history: list[AssistantState] = []
        self.set_state(AssistantState.TRANSCRIBING, history)
        transcription = self.providers.stt.transcribe(audio, filename=filename)
        self.events.publish("voice.transcribed", {"text": transcription.text})

        turn = self.send_text(transcription.text, session_id=session_id)
        combined_history = history + turn.state_history
        self.set_state(AssistantState.SPEAKING, combined_history)
        audio_result = self.providers.tts.speak(turn.assistant_text)
        self.events.publish("voice.spoken", {"mime_type": audio_result.mime_type, "bytes": len(audio_result.audio)})
        self.set_state(AssistantState.IDLE, combined_history)

        return AssistantTurn(
            session_id=turn.session_id,
            user_text=turn.user_text,
            assistant_text=turn.assistant_text,
            state_history=combined_history,
            audio=audio_result,
            saved_memory=turn.saved_memory,
        )

    def save_memory(self, text: str, tags: list[str] | None = None) -> Memory:
        memory = self.store.save_memory(text, tags)
        self.events.publish("memory.saved", {"id": memory.id, "text": memory.text})
        return memory

    def search_memories(self, query: str = "") -> list[Memory]:
        return self.store.search_memories(query)

    def delete_memory(self, memory_id: str) -> bool:
        deleted = self.store.delete_memory(memory_id)
        if deleted:
            self.events.publish("memory.deleted", {"id": memory_id})
        return deleted

    def list_sessions(self):
        return self.store.list_sessions()

    def _build_context(self, session_id: str) -> list[Message]:
        messages = [Message(role="system", content=SYSTEM_PROMPT)]
        memories = self.store.search_memories("", limit=12)
        if memories:
            memory_text = "\n".join(f"- {memory.text}" for memory in memories)
            messages.append(Message(role="system", content=f"Relevant saved user memories:\n{memory_text}"))
        messages.extend(self.store.list_messages(session_id, limit=30))
        return messages

    def _memory_from_command(self, message: str) -> Memory | None:
        for pattern in MEMORY_PATTERNS:
            match = pattern.match(message)
            if match:
                memory_text = match.group("memory").strip().rstrip(".")
                if memory_text:
                    return self.save_memory(memory_text, tags=["explicit"])
        return None
