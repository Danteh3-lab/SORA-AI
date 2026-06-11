from __future__ import annotations

import base64
import json
import os
from typing import Any

from pydantic import BaseModel, Field

from sora_assistant.assistant_core.service import AssistantService
from sora_assistant.config import ApiKeyStore, AssistantConfig
from sora_assistant.models import AssistantTurn
from sora_assistant.models import to_jsonable
from sora_assistant.providers.registry import build_provider_bundle


class TextChatRequest(BaseModel):
    message: str = Field(min_length=1)
    session_id: str | None = None


class MemoryRequest(BaseModel):
    text: str = Field(min_length=1)
    tags: list[str] = Field(default_factory=list)


class SettingsRequest(BaseModel):
    llm_provider: str = Field(min_length=1)
    stt_provider: str = Field(min_length=1)
    tts_provider: str = Field(min_length=1)
    llm_model: str = Field(min_length=1)
    stt_model: str = Field(min_length=1)
    tts_model: str = Field(min_length=1)
    tts_voice: str = Field(min_length=1)
    openai_base_url: str = ""
    nvidia_base_url: str = Field(min_length=1)
    openai_api_key: str = ""
    nvidia_api_key: str = ""


def serialize_turn(turn: AssistantTurn) -> dict[str, Any]:
    payload = to_jsonable(turn)
    if turn.audio:
        payload["audio"] = {
            "audio_base64": base64.b64encode(turn.audio.audio).decode("ascii"),
            "mime_type": turn.audio.mime_type,
            "provider": turn.audio.provider,
            "model": turn.audio.model,
        }
    return payload


def create_app(service: AssistantService):
    try:
        from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
        from fastapi.middleware.cors import CORSMiddleware
    except ImportError as exc:
        raise RuntimeError("Install API dependencies with: pip install -e .") from exc

    key_store = ApiKeyStore()
    allowed_origins = [
        origin.strip()
        for origin in os.environ.get("SORA_ALLOWED_ORIGINS", "").split(",")
        if origin.strip()
    ]
    settings_write_default = "false" if os.environ.get("RAILWAY_ENVIRONMENT") else "true"
    settings_writes_enabled = (
        os.environ.get("SORA_ALLOW_SETTINGS_WRITE", settings_write_default).strip().lower()
        in {"1", "true", "yes", "on"}
    )

    def settings_payload() -> dict[str, Any]:
        return {
            **service.config.redacted(),
            "has_openai_api_key": bool(key_store.get_api_key("openai")),
            "has_nvidia_api_key": bool(key_store.get_api_key("nvidia")),
            "settings_writes_enabled": settings_writes_enabled,
        }

    app = FastAPI(title="Sora Personal Assistant API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {"ok": True, "config": service.config.redacted(), "state": service.state.value}

    @app.get("/settings")
    def get_settings() -> dict[str, Any]:
        return settings_payload()

    @app.put("/settings")
    def update_settings(request: SettingsRequest) -> dict[str, Any]:
        if not settings_writes_enabled:
            raise HTTPException(
                status_code=403,
                detail="Settings updates are disabled in this deployment. Configure providers through environment variables.",
            )
        if request.openai_api_key.strip():
            key_store.set_api_key("openai", request.openai_api_key.strip())
        if request.nvidia_api_key.strip():
            key_store.set_api_key("nvidia", request.nvidia_api_key.strip())

        updated = service.config.with_settings(
            {
                "llm_provider": request.llm_provider,
                "stt_provider": request.stt_provider,
                "tts_provider": request.tts_provider,
                "llm_model": request.llm_model,
                "stt_model": request.stt_model,
                "tts_model": request.tts_model,
                "tts_voice": request.tts_voice,
                "openai_base_url": request.openai_base_url or None,
                "nvidia_base_url": request.nvidia_base_url,
            }
        )
        try:
            providers = build_provider_bundle(updated)
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        updated.save_non_secret_settings()
        service.reconfigure(updated, providers)
        return settings_payload()

    @app.post("/chat/text")
    def chat_text(request: TextChatRequest) -> dict[str, Any]:
        try:
            return serialize_turn(service.send_text(request.message, session_id=request.session_id))
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.post("/chat/voice")
    async def chat_voice(
        session_id: str | None = None,
        file: Any = File(...),
    ) -> dict[str, Any]:
        audio = await file.read()
        if not audio:
            raise HTTPException(status_code=400, detail="Voice upload is empty.")
        try:
            return serialize_turn(service.send_voice(audio, session_id=session_id, filename=file.filename or "audio.wav"))
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @app.post("/memory")
    def create_memory(request: MemoryRequest) -> dict[str, Any]:
        return to_jsonable(service.save_memory(request.text, request.tags))

    @app.get("/memory")
    def list_memory(query: str = "") -> list[dict[str, Any]]:
        return to_jsonable(service.search_memories(query))

    @app.delete("/memory/{memory_id}")
    def delete_memory(memory_id: str) -> dict[str, bool]:
        deleted = service.delete_memory(memory_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Memory not found.")
        return {"deleted": True}

    @app.get("/sessions")
    def list_sessions() -> list[dict[str, Any]]:
        return to_jsonable(service.list_sessions())

    @app.websocket("/events")
    async def events(websocket: WebSocket) -> None:
        await websocket.accept()
        try:
            async for event in service.events.subscribe():
                await websocket.send_text(json.dumps(to_jsonable(event)))
        except WebSocketDisconnect:
            return

    return app


def create_default_app():
    config = AssistantConfig.load()
    service = AssistantService(config=config, providers=build_provider_bundle(config))
    return create_app(service)


def main() -> None:
    try:
        import uvicorn
    except ImportError as exc:
        raise RuntimeError("Install uvicorn to run the API.") from exc

    uvicorn.run(
        "sora_assistant.api.app:create_default_app",
        factory=True,
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8000")),
        reload=False,
    )


if __name__ == "__main__":
    main()
