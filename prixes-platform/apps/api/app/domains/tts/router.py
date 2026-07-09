"""TTS HTTP API — natural speech for the accessibility voice assistant."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field

from app.domains.tts import service

router = APIRouter(prefix="/tts", tags=["tts"])


class TtsRequest(BaseModel):
    text: Annotated[str, Field(min_length=1, max_length=service.MAX_CHARS)]
    voice: str | None = None


@router.post(
    "",
    responses={200: {"content": {"audio/mpeg": {}}}},
    response_class=Response,
)
async def synthesize(req: TtsRequest) -> Response:
    """Return MP3 audio for the given text. 503 when TTS is unavailable (no key/upstream
    error) so the client can fall back to on-device speech synthesis."""
    audio = await service.synthesize(req.text, req.voice)
    if audio is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "TTS unavailable")
    # Immutable per (voice, text) — let the browser/SW cache it too.
    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={"Cache-Control": "public, max-age=604800"},
    )
