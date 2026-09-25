"""Smart Assistant orchestration: sentence in, costed basket out.

The expensive half (the model call) is cached; the cheap half (matching the
catalog and pricing it) is not. That split is deliberate — "raclette pour 6"
always yields the same ingredients, but its price changes daily, so a cached
*basket* would quietly go stale while a cached *ingredient list* never does.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import orjson
from bson import ObjectId
from fastapi import HTTPException, status
from pydantic import ValidationError
from pymongo.errors import PyMongoError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.llm import generate_json, llm_enabled
from app.core.mongo import DRAFTS, mongo_enabled
from app.core.mongo import get_db as get_mongo
from app.core.redis import redis_client
from app.domains.mealplan import catalog
from app.domains.shopping import service as shopping_service
from app.domains.shopping.schemas import ShoppingItemIn
from app.domains.smartcart.prompt import SMART_CART_SYSTEM, smart_cart_user_prompt
from app.domains.smartcart.resolve import resolve_lines
from app.domains.smartcart.schemas import (
    OFF_TOPIC,
    AiDraft,
    CommitLine,
    CommitOut,
    ResolvedLine,
    SmartCartIn,
    SmartCartOut,
)

logger = logging.getLogger(__name__)

_WHITESPACE = re.compile(r"\s+")
_MAX_LINES = 40


def _cache_key(prompt: str, servings: int | None) -> str:
    """Normalised so "Raclette pour 6" and "raclette  pour 6" share a cache entry."""
    normalised = _WHITESPACE.sub(" ", prompt.strip().lower())
    digest = hashlib.sha256(f"{normalised}|{servings or 0}".encode()).hexdigest()[:32]
    return f"smartcart:{digest}"


async def _draft_from_model(data: SmartCartIn) -> tuple[AiDraft | None, bool]:
    """The ingredient list, from cache when we've seen this request before."""
    key = _cache_key(data.prompt, data.servings)
    if (cached := await redis_client.get(key)) is not None:
        try:
            return AiDraft.model_validate(orjson.loads(cached)), True
        except (ValidationError, orjson.JSONDecodeError):
            # A cache entry written by an older schema. Drop it and regenerate.
            await redis_client.delete(key)

    raw = await generate_json(
        system=SMART_CART_SYSTEM,
        user=smart_cart_user_prompt(data.prompt, data.servings),
        schema=AiDraft.model_json_schema(),
        schema_name="liste_de_courses",
        max_tokens=1600,
    )
    if raw is None:
        return None, False
    try:
        draft = AiDraft.model_validate(raw)
    except ValidationError as exc:
        logger.warning(f"Smart cart draft failed validation: {exc}")
        return None, False

    await redis_client.set(key, orjson.dumps(raw), ex=settings.smartcart_cache_ttl_s)
    return draft, False


async def _store_draft(
    user_id: uuid.UUID | None, data: SmartCartIn, draft: AiDraft, lines: list[ResolvedLine]
) -> str:
    """Keep the proposal so we can later see what was proposed vs bought.

    Best-effort: if Mongo is down the user still gets their basket, they just
    lose the audit trail. Returns a client-side id in that case.
    """
    if not mongo_enabled():
        return str(ObjectId())
    doc: dict[str, Any] = {
        # None for a signed-out visitor: the draft is still worth keeping for
        # "what gets asked" without attaching it to anyone.
        "user_id": str(user_id) if user_id else None,
        "prompt": data.prompt,
        "title": draft.title,
        "servings": draft.servings,
        "lines": [line.model_dump(mode="json") for line in lines],
        "created_at": datetime.now(UTC),
        "committed_at": None,
    }
    try:
        result = await get_mongo()[DRAFTS].insert_one(doc)
    except PyMongoError as exc:
        logger.warning(f"Smart cart draft not stored: {exc}")
        return str(ObjectId())
    return str(result.inserted_id)


async def generate(
    db: AsyncSession, user_id: uuid.UUID | None, data: SmartCartIn
) -> SmartCartOut:
    if not llm_enabled():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "L'assistant n'est pas disponible pour le moment.",
        )

    try:
        async with asyncio.timeout(settings.smartcart_deadline_s):
            draft, cached = await _draft_from_model(data)
            if draft is None:
                raise HTTPException(
                    status.HTTP_502_BAD_GATEWAY,
                    "L'assistant n'a pas pu traiter votre demande. Réessayez.",
                )
            if draft.title == OFF_TOPIC or not draft.lines:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "Je n'ai pas reconnu de demande de courses. Essayez par exemple "
                    "« ingrédients pour une raclette pour 6 ».",
                )
            # The prompt asks for 25 lines; cap it anyway, so a runaway answer
            # can't turn into a 200-line shopping list.
            lines = await resolve_lines(db, draft.lines[:_MAX_LINES], data.avoid_allergens)
    except TimeoutError as exc:
        raise HTTPException(
            status.HTTP_504_GATEWAY_TIMEOUT,
            "L'assistant met trop de temps à répondre. Réessayez.",
        ) from exc

    return await _basket(user_id, data, draft, lines, cached)


async def generate_from_catalog(
    db: AsyncSession, user_id: uuid.UUID | None, data: SmartCartIn
) -> SmartCartOut:
    """The free assistant: the request names a dish of the recipe catalogue.

    Free text is Premium (a model call); without it, "une raclette pour 6" still
    works because the catalogue has a raclette. Anything it cannot place gets
    examples of what it can, not a refusal.
    """
    recipe = catalog.find(data.prompt)
    if recipe is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Je n'ai pas trouvé ce plat dans nos recettes. Essayez un nom de plat "
            "(« raclette », « lasagnes », « couscous »…), ou passez à Premium pour "
            "demander n'importe quoi.",
        )
    servings = data.servings or catalog.servings_in(data.prompt) or 4
    draft = AiDraft(title=recipe.title, servings=servings, lines=recipe.lines(servings))
    lines = await resolve_lines(db, draft.lines, data.avoid_allergens)
    return await _basket(user_id, data, draft, lines, cached=False)


async def _basket(
    user_id: uuid.UUID | None,
    data: SmartCartIn,
    draft: AiDraft,
    lines: list[ResolvedLine],
    cached: bool,
) -> SmartCartOut:
    draft_id = await _store_draft(user_id, data, draft, lines)

    priced = [line for line in lines if line.best_price is not None]
    total = sum(
        (line.best_price or Decimal(0)) * line.quantity for line in priced
    ) or None

    return SmartCartOut(
        draft_id=draft_id,
        title=draft.title,
        servings=min(max(draft.servings, 1), 50),
        lines=lines,
        estimated_total=Decimal(total).quantize(Decimal("0.01")) if total else None,
        matched_count=sum(1 for line in lines if line.barcode),
        unpriced_count=sum(1 for line in lines if line.best_price is None),
        cached=cached,
    )


async def commit(
    db: AsyncSession, user_id: uuid.UUID, draft_id: str, lines: list[CommitLine]
) -> CommitOut:
    """Write the user's final selection to their shopping list."""
    payload = [
        ShoppingItemIn(
            barcode=line.barcode,
            free_text=None if line.barcode else (line.free_text or line.name),
            name=line.name,
            quantity=line.quantity,
            amount=line.amount,
            unit=line.unit,
            source="ai",
        )
        for line in lines
    ]
    _, created, merged = await shopping_service.bulk_add(db, user_id, payload)

    # Mark the draft as acted on — this is what makes the collection worth
    # keeping: proposed vs actually bought, per user.
    if mongo_enabled() and ObjectId.is_valid(draft_id):
        try:
            await get_mongo()[DRAFTS].update_one(
                {"_id": ObjectId(draft_id), "user_id": str(user_id)},
                {"$set": {"committed_at": datetime.now(UTC), "committed_lines": len(lines)}},
            )
        except PyMongoError as exc:
            logger.warning(f"Smart cart draft not marked committed: {exc}")

    return CommitOut(added=created, merged=merged)
