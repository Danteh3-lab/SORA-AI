from __future__ import annotations

from typing import Any

from sora_assistant.config import ApiKeyStore, AssistantConfig
from sora_assistant.models import AssistantResponse, Message
from sora_assistant.providers.base import LLMProvider


def _client():
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise RuntimeError("Install the openai package to use the NVIDIA NIM provider.") from exc
    api_key = ApiKeyStore().get_api_key("nvidia")
    if not api_key:
        raise RuntimeError("Missing NVIDIA_API_KEY. Add it in Settings or the OS keyring.")
    return OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=api_key)


def _base_payload(model: str) -> dict[str, Any]:
    return {
        "model": model,
        "max_tokens": 2048,
        "temperature": 0.60,
        "top_p": 0.95,
        "extra_body": {
            "chat_template_kwargs": {"enable_thinking": True},
            "reasoning_budget": 1024,
        },
        "stream": False,
    }


def _merge_payload(base: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    merged = {**base}
    for key, value in overrides.items():
        if key == "extra_body" and isinstance(value, dict) and isinstance(merged.get("extra_body"), dict):
            merged["extra_body"] = {**merged["extra_body"], **value}
        else:
            merged[key] = value
    return merged


def _extract_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        text_parts = [
            part.get("text", "")
            for part in content
            if isinstance(part, dict) and part.get("type") in {None, "text"}
        ]
        return "".join(text_parts)
    return str(content or "")


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
        payload = {
            **_base_payload(self.model),
            "messages": [{"role": message.role, "content": message.content} for message in messages],
        }
        if tools:
            payload["tools"] = tools
        if settings:
            payload = _merge_payload(payload, settings)

        try:
            client = self._client or _client()
            response = client.chat.completions.create(**payload)
        except Exception as exc:
            raise RuntimeError(f"NVIDIA NIM request failed: {exc}") from exc
        message = response.choices[0].message
        text = _extract_text(getattr(message, "content", ""))
        reasoning = getattr(message, "reasoning_content", None)
        raw = {
            "content": text,
            "reasoning_content": reasoning,
            "model": getattr(response, "model", self.model),
        }
        return AssistantResponse(text=text, provider=self.name, model=self.model, raw=raw)
