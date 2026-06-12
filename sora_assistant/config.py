from __future__ import annotations

import os
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any


APP_NAME = "sora-personal-assistant"
DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
DEFAULT_NVIDIA_MODEL = "google/gemma-3n-e2b-it"


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


def _write_env_file(path: Path, values: dict[str, str]) -> None:
    existing: list[str] = []
    updated_keys: set[str] = set()

    if path.exists():
        existing = path.read_text(encoding="utf-8").splitlines()

    output: list[str] = []
    for raw_line in existing:
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            output.append(raw_line)
            continue

        key = line.split("=", 1)[0].strip()
        if key in values:
            output.append(f"{key}={values[key]}")
            updated_keys.add(key)
        else:
            output.append(raw_line)

    for key, value in values.items():
        if key not in updated_keys:
            output.append(f"{key}={value}")

    path.write_text("\n".join(output).rstrip() + "\n", encoding="utf-8")
    for key, value in values.items():
        os.environ[key] = value


def default_data_dir() -> Path:
    configured = os.environ.get("SORA_DATA_DIR")
    if configured:
        return Path(configured).expanduser()
    railway_volume = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH")
    if railway_volume:
        return Path(railway_volume)
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
    llm_provider: str | None = None
    stt_provider: str | None = None
    tts_provider: str | None = None
    nvidia_base_url: str = DEFAULT_NVIDIA_BASE_URL

    @classmethod
    def load(cls, env_file: str | Path = ".env") -> "AssistantConfig":
        _load_env_file(Path(env_file))
        provider = os.environ.get("SORA_PROVIDER", "fake").strip().lower()
        llm_provider = os.environ.get("SORA_LLM_PROVIDER", provider).strip().lower()
        return cls(
            provider=provider,
            data_dir=default_data_dir(),
            llm_model=os.environ.get(
                "SORA_LLM_MODEL",
                DEFAULT_NVIDIA_MODEL if llm_provider == "nvidia_nim" else "gpt-4o-mini",
            ),
            stt_model=os.environ.get("SORA_STT_MODEL", "gpt-4o-mini-transcribe"),
            tts_model=os.environ.get("SORA_TTS_MODEL", "gpt-4o-mini-tts"),
            tts_voice=os.environ.get("SORA_TTS_VOICE", "alloy"),
            wake_word_enabled=_parse_bool(os.environ.get("SORA_WAKE_WORD_ENABLED")),
            wake_word=os.environ.get("SORA_WAKE_WORD", "jarvis"),
            openai_base_url=os.environ.get("OPENAI_BASE_URL") or None,
            llm_provider=llm_provider,
            stt_provider=os.environ.get("SORA_STT_PROVIDER", provider).strip().lower(),
            tts_provider=os.environ.get("SORA_TTS_PROVIDER", provider).strip().lower(),
            nvidia_base_url=os.environ.get("NVIDIA_BASE_URL", DEFAULT_NVIDIA_BASE_URL),
        )

    @property
    def database_path(self) -> Path:
        return self.data_dir / "assistant.sqlite3"

    @property
    def resolved_llm_provider(self) -> str:
        return (self.llm_provider or self.provider).strip().lower()

    @property
    def resolved_stt_provider(self) -> str:
        return (self.stt_provider or self.provider).strip().lower()

    @property
    def resolved_tts_provider(self) -> str:
        return (self.tts_provider or self.provider).strip().lower()

    def with_settings(self, settings: dict[str, Any]) -> "AssistantConfig":
        allowed = {
            "llm_provider",
            "stt_provider",
            "tts_provider",
            "llm_model",
            "stt_model",
            "tts_model",
            "tts_voice",
            "openai_base_url",
            "nvidia_base_url",
        }
        clean = {key: value.strip() if isinstance(value, str) else value for key, value in settings.items() if key in allowed}
        return replace(self, **clean)

    def save_non_secret_settings(self, env_file: str | Path = ".env") -> None:
        values = {
            "SORA_LLM_PROVIDER": self.resolved_llm_provider,
            "SORA_STT_PROVIDER": self.resolved_stt_provider,
            "SORA_TTS_PROVIDER": self.resolved_tts_provider,
            "SORA_LLM_MODEL": self.llm_model,
            "SORA_STT_MODEL": self.stt_model,
            "SORA_TTS_MODEL": self.tts_model,
            "SORA_TTS_VOICE": self.tts_voice,
            "OPENAI_BASE_URL": self.openai_base_url or "",
            "NVIDIA_BASE_URL": self.nvidia_base_url,
        }
        _write_env_file(Path(env_file), values)

    def redacted(self) -> dict[str, str | bool]:
        return {
            "provider": self.provider,
            "llm_provider": self.resolved_llm_provider,
            "stt_provider": self.resolved_stt_provider,
            "tts_provider": self.resolved_tts_provider,
            "data_dir": str(self.data_dir),
            "llm_model": self.llm_model,
            "stt_model": self.stt_model,
            "tts_model": self.tts_model,
            "tts_voice": self.tts_voice,
            "wake_word_enabled": self.wake_word_enabled,
            "wake_word": self.wake_word,
            "openai_base_url": self.openai_base_url or "",
            "nvidia_base_url": self.nvidia_base_url,
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
