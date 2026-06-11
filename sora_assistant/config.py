from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


APP_NAME = "sora-personal-assistant"


def _parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def default_data_dir() -> Path:
    configured = os.environ.get("SORA_DATA_DIR")
    if configured:
        return Path(configured).expanduser()
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "SoraAssistant"
    return Path.home() / ".sora-assistant"


@dataclass(frozen=True)
class AssistantConfig:
    provider: str
    data_dir: Path
    llm_model: str
    stt_model: str
    tts_model: str
    tts_voice: str
    wake_word_enabled: bool
    wake_word: str
    openai_base_url: str | None = None

    @classmethod
    def load(cls, env_file: str | Path = ".env") -> "AssistantConfig":
        _load_env_file(Path(env_file))
        return cls(
            provider=os.environ.get("SORA_PROVIDER", "fake").strip().lower(),
            data_dir=default_data_dir(),
            llm_model=os.environ.get("SORA_LLM_MODEL", "gpt-4o-mini"),
            stt_model=os.environ.get("SORA_STT_MODEL", "gpt-4o-mini-transcribe"),
            tts_model=os.environ.get("SORA_TTS_MODEL", "gpt-4o-mini-tts"),
            tts_voice=os.environ.get("SORA_TTS_VOICE", "alloy"),
            wake_word_enabled=_parse_bool(os.environ.get("SORA_WAKE_WORD_ENABLED")),
            wake_word=os.environ.get("SORA_WAKE_WORD", "jarvis"),
            openai_base_url=os.environ.get("OPENAI_BASE_URL") or None,
        )

    @property
    def database_path(self) -> Path:
        return self.data_dir / "assistant.sqlite3"

    def redacted(self) -> dict[str, str | bool]:
        return {
            "provider": self.provider,
            "data_dir": str(self.data_dir),
            "llm_model": self.llm_model,
            "stt_model": self.stt_model,
            "tts_model": self.tts_model,
            "tts_voice": self.tts_voice,
            "wake_word_enabled": self.wake_word_enabled,
            "wake_word": self.wake_word,
            "openai_base_url": self.openai_base_url or "",
        }


class ApiKeyStore:
    """Stores provider API keys in OS keyring when possible, falling back to env."""

    def __init__(self, service_name: str = APP_NAME) -> None:
        self.service_name = service_name

    def get_api_key(self, provider: str) -> str | None:
        env_key = f"{provider.upper()}_API_KEY"
        try:
            import keyring

            stored = keyring.get_password(self.service_name, env_key)
            if stored:
                return stored
        except Exception:
            pass
        return os.environ.get(env_key)

    def set_api_key(self, provider: str, api_key: str) -> bool:
        env_key = f"{provider.upper()}_API_KEY"
        try:
            import keyring

            keyring.set_password(self.service_name, env_key, api_key)
            return True
        except Exception:
            os.environ[env_key] = api_key
            return False

