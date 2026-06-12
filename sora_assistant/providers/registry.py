from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from sora_assistant.config import AssistantConfig
from sora_assistant.providers.base import LLMProvider, SpeechToTextProvider, TextToSpeechProvider
from sora_assistant.providers.fake import BrowserTextToSpeechProvider, FakeLLMProvider, FakeSpeechToTextProvider, FakeTextToSpeechProvider


@dataclass(frozen=True)
class ProviderBundle:
    llm: LLMProvider
    stt: SpeechToTextProvider
    tts: TextToSpeechProvider


ProviderFactory = Callable[[AssistantConfig], ProviderBundle]
LLMFactory = Callable[[AssistantConfig], LLMProvider]
STTFactory = Callable[[AssistantConfig], SpeechToTextProvider]
TTSFactory = Callable[[AssistantConfig], TextToSpeechProvider]


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


def _llm_factory(name: str) -> LLMFactory:
    if name == "fake":
        return lambda config: FakeLLMProvider(model=config.llm_model)
    if name == "openai":
        from sora_assistant.providers.openai_provider import OpenAILLMProvider

        return OpenAILLMProvider
    if name == "nvidia_nim":
        from sora_assistant.providers.nvidia_nim_provider import NvidiaNimLLMProvider

        return NvidiaNimLLMProvider
    raise ValueError(f"Unknown LLM provider '{name}'. Available providers: fake, nvidia_nim, openai")


def _stt_factory(name: str) -> STTFactory:
    if name == "fake":
        return lambda config: FakeSpeechToTextProvider(model=config.stt_model)
    if name == "openai":
        from sora_assistant.providers.openai_provider import OpenAISpeechToTextProvider

        return OpenAISpeechToTextProvider
    if name == "nvidia_nim":
        from sora_assistant.providers.nvidia_speech_provider import NvidiaSpeechToTextProvider

        return NvidiaSpeechToTextProvider
    raise ValueError(f"Unknown STT provider '{name}'. Available providers: fake, nvidia_nim, openai")


def _tts_factory(name: str) -> TTSFactory:
    if name == "fake":
        return lambda config: FakeTextToSpeechProvider(model=config.tts_model)
    if name == "openai":
        from sora_assistant.providers.openai_provider import OpenAITextToSpeechProvider

        return OpenAITextToSpeechProvider
    if name == "elevenlabs":
        from sora_assistant.providers.elevenlabs_provider import ElevenLabsTextToSpeechProvider

        return ElevenLabsTextToSpeechProvider
    if name == "browser":
        return lambda config: BrowserTextToSpeechProvider(model=config.tts_model)
    raise ValueError(f"Unknown TTS provider '{name}'. Available providers: browser, elevenlabs, fake, openai")


def default_registry() -> ProviderRegistry:
    registry = ProviderRegistry()
    registry.register("fake", _fake_bundle)
    registry.register("openai", _openai_bundle)
    return registry


def build_provider_bundle(config: AssistantConfig, registry: ProviderRegistry | None = None) -> ProviderBundle:
    if registry is not None and not any((config.llm_provider, config.stt_provider, config.tts_provider)):
        return registry.create(config.provider, config)
    return ProviderBundle(
        llm=_llm_factory(config.resolved_llm_provider)(config),
        stt=_stt_factory(config.resolved_stt_provider)(config),
        tts=_tts_factory(config.resolved_tts_provider)(config),
    )
