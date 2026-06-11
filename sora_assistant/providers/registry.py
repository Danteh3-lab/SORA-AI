from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from sora_assistant.config import AssistantConfig
from sora_assistant.providers.base import LLMProvider, SpeechToTextProvider, TextToSpeechProvider
from sora_assistant.providers.fake import FakeLLMProvider, FakeSpeechToTextProvider, FakeTextToSpeechProvider


@dataclass(frozen=True)
class ProviderBundle:
    llm: LLMProvider
    stt: SpeechToTextProvider
    tts: TextToSpeechProvider


ProviderFactory = Callable[[AssistantConfig], ProviderBundle]


class ProviderRegistry:
    def __init__(self) -> None:
        self._factories: dict[str, ProviderFactory] = {}

    def register(self, name: str, factory: ProviderFactory) -> None:
        self._factories[name.lower()] = factory

    def create(self, name: str, config: AssistantConfig) -> ProviderBundle:
        key = name.lower()
        if key not in self._factories:
            available = ", ".join(sorted(self._factories)) or "none"
            raise ValueError(f"Unknown provider '{name}'. Available providers: {available}")
        return self._factories[key](config)


def _fake_bundle(config: AssistantConfig) -> ProviderBundle:
    return ProviderBundle(
        llm=FakeLLMProvider(model=config.llm_model),
        stt=FakeSpeechToTextProvider(model=config.stt_model),
        tts=FakeTextToSpeechProvider(model=config.tts_model),
    )


def _openai_bundle(config: AssistantConfig) -> ProviderBundle:
    from sora_assistant.providers.openai_provider import (
        OpenAILLMProvider,
        OpenAISpeechToTextProvider,
        OpenAITextToSpeechProvider,
    )

    return ProviderBundle(
        llm=OpenAILLMProvider(config),
        stt=OpenAISpeechToTextProvider(config),
        tts=OpenAITextToSpeechProvider(config),
    )


def default_registry() -> ProviderRegistry:
    registry = ProviderRegistry()
    registry.register("fake", _fake_bundle)
    registry.register("openai", _openai_bundle)
    return registry


def build_provider_bundle(config: AssistantConfig, registry: ProviderRegistry | None = None) -> ProviderBundle:
    return (registry or default_registry()).create(config.provider, config)

