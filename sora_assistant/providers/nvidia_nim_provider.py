from __future__ import annotations

from typing import Any

from sora_assistant.config import ApiKeyStore, AssistantConfig
from sora_assistant.models import AssistantResponse, Message
from sora_assistant.providers.base import LLMProvider


def _client():
    try:
        import requests
    except ImportError as exc:
        raise RuntimeError("Install the requests package to use the NVIDIA NIM provider.") from exc
    return requests


def _headers(config: AssistantConfig) -> dict[str, str]:
    api_key = ApiKeyStore().get_api_key("nvidia")
    if not api_key:
        raise RuntimeError("Missing NVIDIA_API_KEY. Add it in Settings or the OS keyring.")
    return {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }


def _base_payload(model: str) -> dict[str, Any]:
    return {
        "model": model,
        "max_tokens": 512,
        "temperature": 0.20,
        "top_p": 0.70,
        "frequency_penalty": 0.00,
        "presence_penalty": 0.00,
        "stream": False,
    }


def _extract_text(payload: dict[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    message = choices[0].get("message", {})
    content = message.get("content", "")
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
            payload.update(settings)

        try:
            headers = _headers(self.config)
            client = self._client or _client()
            response = client.post(
                f"{self.config.nvidia_base_url.rstrip('/')}/chat/completions",
                headers=headers,
                json=payload,
                timeout=60,
            )
            response.raise_for_status()
            raw = response.json()
        except Exception as exc:
            raise RuntimeError(f"NVIDIA NIM request failed: {exc}") from exc
        text = _extract_text(raw)
        return AssistantResponse(text=text, provider=self.name, model=self.model, raw=raw)
