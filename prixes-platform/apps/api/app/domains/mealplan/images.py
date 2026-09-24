"""Une photo par plat — generated once per dish title, then served from disk.

The planner invents its dishes ("Boulgour à la tomate et escalope végétale"), so
no photo library has them. We ask Cloudflare Workers AI (FLUX.1 schnell, Apache
2.0 — free for commercial use) for one the first time a title appears and keep
the file: the same dish next week, or for another user, costs nothing. The daily
cap is set under Cloudflare's free allocation, so the photos cost nothing at all.

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

_CF_URL = "https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{model}"

# FLUX answers in JPEG today; files keep whatever format actually came back, told
# apart by their first bytes, so a provider change never mislabels a photo.
FORMATS = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
_MAGIC = ((bytes([0xFF, 0xD8, 0xFF]), "jpg"), (bytes([0x89]) + b"PNG", "png"), (b"RIFF", "webp"))

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


def image_path(key: str, ext: str) -> Path:
    return Path(settings.meal_image_dir) / f"{key}.{ext}"


def image_url(key: str, ext: str) -> str:
    return f"/api/v1/meal-plan/images/{key}.{ext}"


def _existing(key: str) -> str | None:
    """The URL of this dish's photo if it has already been drawn, in any format."""
    for ext in FORMATS:
        if image_path(key, ext).exists():
            return image_url(key, ext)
    return None


def _format_of(data: bytes) -> str | None:
    return next((ext for magic, ext in _MAGIC if data.startswith(magic)), None)


def _enabled() -> bool:
    return bool(settings.cloudflare_account_id and settings.cloudflare_ai_token)


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


def _retry_delay(header: str | None) -> float:
    """Seconds to wait after a 429: the server's Retry-After, kept between 2 and 20."""
    try:
        return min(max(float(header or 5), 2.0), 20.0)
    except ValueError:
        return 5.0


async def _generate(title: str) -> bytes | None:
    url = _CF_URL.format(account=settings.cloudflare_account_id, model=settings.meal_image_model)
    payload = {"prompt": _PROMPT.format(title=title), "steps": 4}
    headers = {"Authorization": f"Bearer {settings.cloudflare_ai_token}"}
    # Seven dishes asked at once can trip a per-minute limit (429). That is a
    # "not yet", not a "no": wait as told, then try once more.
    for attempt in range(2):
        try:
            resp = await get_http_client().post(url, json=payload, headers=headers, timeout=90.0)
        except Exception as exc:
            logger.warning(f"Meal image request failed: {exc}")
            return None
        if resp.status_code != 429 or attempt == 1:
            break
        await asyncio.sleep(_retry_delay(resp.headers.get("retry-after")))
    if resp.status_code != 200:
        logger.warning(f"Meal image upstream {resp.status_code}: {resp.text[:200]}")
        return None
    try:
        return base64.b64decode(resp.json()["result"]["image"])
    except (KeyError, ValueError, TypeError) as exc:
        logger.warning(f"Meal image response unreadable: {exc}")
        return None


async def photo_for(title: str) -> str | None:
    """The URL of this dish's photo, drawing it first if it has never been drawn."""
    title = " ".join(title.split())[:120]
    if not title:
        return None
    key = image_key(title)
    if found := _existing(key):
        return found
    if not _enabled():
        return None

    lock = _in_flight.setdefault(key, asyncio.Lock())
    try:
        async with lock:
            # The card that waited on the lock finds the photo the first one drew.
            if found := _existing(key):
                return found
            if not await _take_daily_slot():
                return None
            async with _concurrency:
                data = await _generate(title)
            ext = _format_of(data) if data else None
            if not data or not ext:
                if data:
                    logger.warning("Meal image in an unknown format, not kept")
                return None
            path = image_path(key, ext)
            path.parent.mkdir(parents=True, exist_ok=True)
            # Write then rename: a half-written file must never be served.
            tmp = path.with_suffix(".tmp")
            tmp.write_bytes(data)
            tmp.replace(path)
            return image_url(key, ext)
    finally:
        if not lock.locked():
            with contextlib.suppress(KeyError):
                del _in_flight[key]
