"""TTS service — synthesize speech via OpenAI, cached in Redis.

The voice assistant reads short French snippets (product names, prices, warnings).
Utterances repeat a lot ("Ajouté à votre liste", allergen phrases…), so we cache the
resulting MP3 in Redis keyed by model+voice+text — most requests never hit OpenAI, which
keeps both latency and cost down. Returns None on any upstream failure so the frontend
can fall back to on-device/browser TTS.
"""
from __future__ import annotations

import contextlib
import hashlib

from app.core.config import settings
from app.core.http import get_http_client
from app.core.redis import redis_client

_OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech"

# Synthesized clips are immutable for a given (model, voice, text) → cache them a week.
_CACHE_TTL = 7 * 24 * 3600
# Guard against abuse / runaway cost: refuse to synthesize very long inputs.
MAX_CHARS = 600


def _cache_key(model: str, voice: str, text: str) -> str:
    digest = hashlib.sha256(f"{model}|{voice}|{text}".encode()).hexdigest()
    return f"tts:{digest}"


async def synthesize(text: str, voice: str | None = None) -> bytes | None:
    """Return MP3 audio for `text`, or None if TTS is unavailable/failed."""
    if not settings.openai_api_key:
        return None
    text = text.strip()
    if not text:
        return None
    text = text[:MAX_CHARS]
    voice = voice or settings.openai_tts_voice
    model = settings.openai_tts_model

    key = _cache_key(model, voice, text)
    try:
        cached = await redis_client.get(key)
    except Exception:  # noqa: BLE001 — cache is best-effort; synthesize anyway
        cached = None
    if cached is not None:
        # Redis is decode_responses=True (str); audio was stored latin-1-encoded.
        return str(cached).encode("latin-1")

    payload = {"model": model, "voice": voice, "input": text, "response_format": "mp3"}
    headers = {"Authorization": f"Bearer {settings.openai_api_key}"}
    try:
        resp = await get_http_client().post(
            _OPENAI_TTS_URL, json=payload, headers=headers, timeout=30.0
        )
        if resp.status_code != 200:
            return None
        audio = resp.content
    except Exception:  # noqa: BLE001 — never propagate upstream failures
        return None

    # Caching is best-effort — a Redis hiccup must never break TTS itself.
    with contextlib.suppress(Exception):
        await redis_client.set(key, audio.decode("latin-1"), ex=_CACHE_TTL)
    return audio
