# Sora Personal Assistant Core

This is a local-first Python core for a Jarvis-style personal assistant. It focuses on the backend capabilities first: conversation, provider-agnostic AI adapters, explicit memory, voice interfaces, and a local API for a future frontend.

## What Exists

- Provider contracts for LLM, speech-to-text, and text-to-speech.
- A local SQLite store for sessions, messages, and explicit memories.
- A core assistant service with text and voice turns.
- A FastAPI app exposing `/chat/text`, `/chat/voice`, `/memory`, `/sessions`, and `/events`.
- Fake providers for offline development and tests.
- An OpenAI-compatible provider adapter that can be enabled with an API key.

## Quick Start

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev,voice]"
Copy-Item .env.example .env
```

Set your API key in `.env` or through the OS keyring later:

```powershell
SORA_PROVIDER=openai
OPENAI_API_KEY=your_key_here
```

Run the API:

```powershell
uvicorn sora_assistant.api.app:create_default_app --factory --reload
```

For no-key development, leave `SORA_PROVIDER=fake`.

## Current Boundaries

V1 does not run shell commands, automate apps, browse files, or perform OS control. Those abilities should be added later through an approval-based tool layer.

