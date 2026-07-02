"""Shared async Redis client + small cache-aside helper."""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

import orjson
import redis.asyncio as aioredis

from app.core.config import settings

redis_client: aioredis.Redis = aioredis.from_url(
    str(settings.redis_url), encoding="utf-8", decode_responses=True
)

# Redis Sorted-Set keys for ranked feeds (see ARCHITECTURE.md §7)
FEED_HOT = "deals:feed:hot"
FEED_NEW = "deals:feed:new"
FEED_TOP = "deals:feed:top"


async def cache_aside(
    key: str,
    ttl: int,
    loader: Callable[[], Awaitable[Any]],
) -> Any:
    """Return cached JSON for ``key`` or compute via ``loader`` and store it."""
    cached = await redis_client.get(key)
    if cached is not None:
        return orjson.loads(cached)
    value = await loader()
    await redis_client.set(key, orjson.dumps(value), ex=ttl)
    return value


async def invalidate(*keys: str) -> None:
    if keys:
        await redis_client.delete(*keys)
