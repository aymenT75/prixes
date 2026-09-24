"""TTS HTTP API — natural speech for the accessibility voice assistant."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field

from app.core.deps import OptionalUser
from app.domains.billing.service import is_premium, premium_required
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
async def synthesize(req: TtsRequest, user: OptionalUser) -> Response:
    """Return MP3 audio for the given text. The natural voice is Premium (a paid call):
    402 without it, 503 when TTS is unavailable — either way the client falls back
    to the device's own voice, which stays free."""
    if user is None or not is_premium(user):
        raise premium_required()
    audio = await service.synthesize(req.text, req.voice)
    if audio is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "TTS unavailable")
    # Immutable per (voice, text) — let the browser/SW cache it too.
    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={"Cache-Control": "public, max-age=604800"},
    )
