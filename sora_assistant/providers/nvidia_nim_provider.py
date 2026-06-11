from __future__ import annotations

from typing import Any

from sora_assistant.config import ApiKeyStore, AssistantConfig
from sora_assistant.models import AssistantResponse, Message
from sora_assistant.providers.base import LLMProvider


def _client(config: AssistantConfig):
    api_key = ApiKeyStore().get_api_key("nvidia")
    if not api_key:
        raise RuntimeError("Missing NVIDIA_API_KEY. Add it in Settings or the OS keyring.")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise RuntimeError("Install the openai package to use the NVIDIA NIM provider.") from exc

    return OpenAI(api_key=api_key, base_url=config.nvidia_base_url)


class NvidiaNimLLMProvider(LLMProvider):
    name = "nvidia_nim"

    def __init__(self, config: AssistantConfig, client: Any | None = None) -> None:
        self.config = config
        self.model = config.llm_model
        self._client = client

    def generate(
        self,
        messages: list[Message],
        tools: list[dict[str, Any]] | None = None,
        settings: dict[str, Any] | None = None,
    ) -> AssistantResponse:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [{"role": message.role, "content": message.content} for message in messages],
        }
        if tools:
            payload["tools"] = tools
        if settings:
            payload.update(settings)

        try:
            client = self._client or _client(self.config)
            response = client.chat.completions.create(**payload)
        except Exception as exc:
            raise RuntimeError(f"NVIDIA NIM request failed: {exc}") from exc
        text = response.choices[0].message.content or ""
        return AssistantResponse(text=text, provider=self.name, model=self.model)
