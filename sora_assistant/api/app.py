from __future__ import annotations

import base64
import json
from typing import Any

from sora_assistant.assistant_core.service import AssistantService
from sora_assistant.config import AssistantConfig
from sora_assistant.models import AssistantTurn
from sora_assistant.models import to_jsonable
from sora_assistant.providers.registry import build_provider_bundle


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
        from pydantic import BaseModel, Field
    except ImportError as exc:
        raise RuntimeError("Install API dependencies with: pip install -e .") from exc

    class TextChatRequest(BaseModel):
        message: str = Field(min_length=1)
        session_id: str | None = None

    class MemoryRequest(BaseModel):
        text: str = Field(min_length=1)
        tags: list[str] = Field(default_factory=list)

    app = FastAPI(title="Sora Personal Assistant API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {"ok": True, "config": service.config.redacted(), "state": service.state.value}

    @app.post("/chat/text")
    def chat_text(request: TextChatRequest) -> dict[str, Any]:
        return serialize_turn(service.send_text(request.message, session_id=request.session_id))

    @app.post("/chat/voice")
    async def chat_voice(
        session_id: str | None = None,
        file: UploadFile = File(...),
    ) -> dict[str, Any]:
        audio = await file.read()
        if not audio:
            raise HTTPException(status_code=400, detail="Voice upload is empty.")
        return serialize_turn(service.send_voice(audio, session_id=session_id, filename=file.filename or "audio.wav"))

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

    uvicorn.run("sora_assistant.api.app:create_default_app", factory=True, host="127.0.0.1", port=8000, reload=False)


if __name__ == "__main__":
    main()
