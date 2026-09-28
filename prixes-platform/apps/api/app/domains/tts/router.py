"""TTS HTTP API — natural speech for the accessibility voice assistant."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from app.core.rate_limit import RateLimit
from app.domains.tts import service

router = APIRouter(prefix="/tts", tags=["tts"])


class TtsRequest(BaseModel):
    text: Annotated[str, Field(min_length=1, max_length=service.MAX_CHARS)]
    voice: str | None = None


@router.post(
    "",
    responses={200: {"content": {"audio/mpeg": {}}}},
    response_class=Response,
    # Free for everyone — the voice is how a blind user uses the app, so it is
    # not a Premium extra. The Redis cache answers the repeated sentences; this
    # limit (per account, else per IP) only stops a script from running up a bill.
    dependencies=[Depends(RateLimit("tts", times=300, window=3600))],
)
async def synthesize(req: TtsRequest) -> Response:
    """Return MP3 audio for the given text. 503 when TTS is unavailable (no key or
    an upstream error) so the client falls back to the device's own voice."""
    audio = await service.synthesize(req.text, req.voice)
    if audio is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "TTS unavailable")
    # Immutable per (voice, text) — let the browser/SW cache it too.
    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={"Cache-Control": "public, max-age=604800"},
    )
