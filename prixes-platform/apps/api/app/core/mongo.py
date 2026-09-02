"""MongoDB (Atlas) client for the V3 document collections.

Postgres stays the source of truth for the relational core — products, prices,
users, fuel. Mongo holds what is genuinely document-shaped and new in V3: a
smart-cart draft, a week of meals, an imported recipe. Each of those is read and
written whole, so one document beats five joined tables.

When ``mongo_url`` is empty the V3 endpoints answer 503 instead of crashing: the
rest of Prixes must keep working without Mongo (that is also how the test suite
and a fresh local checkout run).

Uses PyMongo's own async driver (``AsyncMongoClient``, PyMongo >= 4.9) rather
than Motor, which reached end of life in May 2026.
"""
from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import Depends, HTTPException, status
from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import PyMongoError

from app.core.config import settings

logger = logging.getLogger(__name__)

MongoDb = AsyncDatabase[dict[str, Any]]

_client: AsyncMongoClient[dict[str, Any]] | None = None

# Collection names, in one place so a typo can't create a phantom collection.
DRAFTS = "smart_cart_drafts"
MEAL_PLANS = "meal_plans"
RECIPES = "recipes"


def mongo_enabled() -> bool:
    return bool(settings.mongo_url)


def get_client() -> AsyncMongoClient[dict[str, Any]]:
    global _client
    if _client is None:
        if not mongo_enabled():
            raise RuntimeError("MONGO_URL is not configured")
        _client = AsyncMongoClient(
            settings.mongo_url,
            # Atlas M0 caps connections cluster-wide and the API and worker share
            # that budget, so stay modest. Fail fast rather than hang a request.
            maxPoolSize=10,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            tz_aware=True,
        )
    return _client


def get_db() -> MongoDb:
    return get_client()[settings.mongo_db]


def require_db() -> MongoDb:
    """FastAPI dependency — 503, not 500, when Mongo isn't configured."""
    if not mongo_enabled():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Fonctionnalité indisponible : base documentaire non configurée.",
        )
    return get_db()


Mongo = Annotated[MongoDb, Depends(require_db)]


def optional_db() -> MongoDb | None:
    """For endpoints where Mongo is a bonus, not a requirement.

    The recipe import is the case that matters: it caches what it imported, but
    the import itself is a fetch and a parse. Depending on `Mongo` there would
    take the whole feature offline whenever Atlas is unreachable — a cache
    outage disabling the thing being cached.
    """
    return get_db() if mongo_enabled() else None


OptionalMongo = Annotated[MongoDb | None, Depends(optional_db)]


async def ensure_indexes() -> None:
    """Create the V3 indexes at startup. Idempotent, and never fatal.

    Index creation is best-effort on purpose: an Atlas hiccup at boot must not
    keep the whole API from starting, and every query below still works (more
    slowly) without its index.
    """
    if not mongo_enabled():
        logger.info("MONGO_URL empty — V3 document features disabled")
        return
    db = get_db()
    try:
        # Drafts are throwaway: a proposal the user hasn't committed. Let Mongo
        # expire them so the collection can't grow without bound.
        await db[DRAFTS].create_index("created_at", expireAfterSeconds=7 * 24 * 3600)
        await db[DRAFTS].create_index([("user_id", 1), ("created_at", -1)])

        # One plan per user per week — upserting on this pair replaces cleanly.
        await db[MEAL_PLANS].create_index([("user_id", 1), ("week_start", 1)], unique=True)

        # Imported recipes are cached by URL so re-importing is free.
        await db[RECIPES].create_index("url", unique=True)
    except PyMongoError as exc:
        logger.warning(f"Mongo index setup skipped: {exc}")


async def ping() -> bool:
    """True when Atlas answers — used by /health and the meta endpoint."""
    if not mongo_enabled():
        return False
    try:
        await get_client().admin.command("ping")
    except PyMongoError as exc:
        logger.warning(f"Mongo ping failed: {exc}")
        return False
    return True


async def close_mongo() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None
