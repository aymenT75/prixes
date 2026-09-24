"""Une photo par plat — generated once per dish title, then served from disk.

The planner invents its dishes ("Boulgour à la tomate et escalope végétale"), so
no photo library has them. We ask OpenAI's image model for one the first time a
title appears and keep the file: the same dish next week, or for another user,
costs nothing. A daily cap bounds the bill whatever happens.

Every failure — no key, cap reached, upstream error — returns None, and the page
shows the dish's icon instead. A menu never waits for, or breaks on, a picture.
"""
from __future__ import annotations

import asyncio
import base64
import contextlib
import hashlib
import logging
import re
import unicodedata
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import settings
from app.core.http import get_http_client
from app.core.redis import redis_client

logger = logging.getLogger(__name__)

_OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations"

# A key is 24 hex characters; the route refuses anything else, so a request can
# never name a file outside the image directory.
KEY_PATTERN = re.compile(r"^[0-9a-f]{24}$")

_PROMPT = (
    "Photographie culinaire réaliste d'un plat fait maison : « {title} ». "
    "Servi dans une assiette simple, vue en plongée à 45 degrés, sur une table en "
    "bois clair, lumière naturelle douce, couleurs appétissantes. "
    "Aucun texte, aucune écriture, aucune personne, aucune main."
)

# Seven dishes arrive at once; three at a time keeps the droplet and the rate
# limit calm, and the first photos show up while the others are being drawn.
_concurrency = asyncio.Semaphore(3)
# Two cards asking for the same dish must not pay for it twice.
_in_flight: dict[str, asyncio.Lock] = {}


def image_key(title: str) -> str:
    """Titles repeat with small differences in case and accents ("Poêlée" /
    "poelee"): one photo for all of them."""
    folded = unicodedata.normalize("NFKD", title.casefold())
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    folded = " ".join(re.sub(r"[^a-z0-9]+", " ", folded).split())
    return hashlib.sha256(folded.encode()).hexdigest()[:24]


def image_path(key: str) -> Path:
    return Path(settings.meal_image_dir) / f"{key}.webp"


def image_url(key: str) -> str:
    return f"/api/v1/meal-plan/images/{key}.webp"


async def _take_daily_slot() -> bool:
    """Count one generation against today's cap; False once it is spent."""
    day = datetime.now(UTC).strftime("%Y%m%d")
    counter = f"mealimg:{day}"
    try:
        used = await redis_client.incr(counter)
        if used == 1:
            await redis_client.expire(counter, 2 * 86400)
    except Exception as exc:
        # Without the counter there is no cap: refuse rather than spend blind.
        logger.warning(f"Meal image cap unavailable: {exc}")
        return False
    return int(used) <= settings.meal_image_daily_cap


async def _generate(title: str) -> bytes | None:
    payload = {
        "model": settings.meal_image_model,
        "prompt": _PROMPT.format(title=title),
        "size": "1024x1024",
        "quality": "low",
        "output_format": "webp",
        "output_compression": 70,
        "n": 1,
    }
    headers = {"Authorization": f"Bearer {settings.openai_api_key}"}
    try:
        resp = await get_http_client().post(
            _OPENAI_IMAGES_URL, json=payload, headers=headers, timeout=90.0
        )
    except Exception as exc:
        logger.warning(f"Meal image request failed: {exc}")
        return None
    if resp.status_code != 200:
        logger.warning(f"Meal image upstream {resp.status_code}: {resp.text[:200]}")
        return None
    try:
        return base64.b64decode(resp.json()["data"][0]["b64_json"])
    except (KeyError, IndexError, ValueError, TypeError) as exc:
        logger.warning(f"Meal image response unreadable: {exc}")
        return None


async def photo_for(title: str) -> str | None:
    """The URL of this dish's photo, drawing it first if it has never been drawn."""
    title = " ".join(title.split())[:120]
    if not title:
        return None
    key = image_key(title)
    path = image_path(key)
    if path.exists():
        return image_url(key)
    if not settings.openai_api_key:
        return None

    lock = _in_flight.setdefault(key, asyncio.Lock())
    try:
        async with lock:
            # The card that waited on the lock finds the photo the first one drew.
            if path.exists():
                return image_url(key)
            if not await _take_daily_slot():
                return None
            async with _concurrency:
                data = await _generate(title)
            if not data:
                return None
            path.parent.mkdir(parents=True, exist_ok=True)
            # Write then rename: a half-written file must never be served.
            tmp = path.with_suffix(".tmp")
            tmp.write_bytes(data)
            tmp.replace(path)
            return image_url(key)
    finally:
        if not lock.locked():
            with contextlib.suppress(KeyError):
                del _in_flight[key]
