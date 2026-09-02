"""Recipe import — a link becomes a costed basket.

Works with any site that publishes schema.org/Recipe structured data, which
includes Cookidoo's public pages, Marmiton and most French recipe sites. A
Cookidoo recipe that is behind a subscription is not readable, and says so.

Storing only the ingredient list, the title and the source link is a deliberate
limit: the method text belongs to its author.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, HttpUrl
from pymongo.errors import PyMongoError

from app.core.deps import CurrentUser, DbSession
from app.core.mongo import RECIPES, OptionalMongo
from app.domains.recipes import jsonld
from app.domains.recipes.fetch import fetch_html
from app.domains.shopping import service as shopping_service
from app.domains.shopping.router import _enrich
from app.domains.shopping.schemas import BulkAddOut, ShoppingItemIn
from app.domains.smartcart.resolve import resolve_lines
from app.domains.smartcart.schemas import ResolvedLine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/recipes", tags=["recipes"])


class ImportIn(BaseModel):
    url: HttpUrl
    servings: int | None = Field(default=None, ge=1, le=50)
    avoid_allergens: list[str] = Field(default_factory=list, max_length=20)


class ImportOut(BaseModel):
    title: str
    source_url: str
    servings: int
    ingredients: list[ResolvedLine]
    estimated_total: Decimal | None = None
    unpriced_count: int = 0


class AddIn(BaseModel):
    lines: list[ShoppingItemIn] = Field(min_length=1, max_length=60)


@router.post("/import", response_model=ImportOut)
async def import_recipe(
    data: ImportIn, db: DbSession, mongo: OptionalMongo, user: CurrentUser
) -> ImportOut:
    url = str(data.url)
    _, html = await fetch_html(url)

    node = jsonld.find_recipe(html)
    if node is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Cette page ne publie pas de recette lisible. Si elle est réservée aux "
            "abonnés, copiez les ingrédients à la main.",
        )

    ingredients = jsonld.ingredients_from(node)
    if not ingredients:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Aucun ingrédient n'a pu être lu sur cette page.",
        )

    servings = data.servings or jsonld.servings_from(node)
    resolved = await resolve_lines(db, ingredients, data.avoid_allergens)

    total = sum((line.best_price or Decimal(0)) * line.quantity for line in resolved)
    unpriced = sum(1 for line in resolved if line.best_price is None)

    doc: dict[str, Any] = {
        "url": url,
        "title": jsonld.title_from(node),
        "servings": servings,
        # Ingredients only — never the method.
        "ingredients": [line.model_dump(mode="json") for line in ingredients],
        "imported_at": datetime.now(UTC),
        "imported_by": str(user.id),
    }
    if mongo is not None:
        try:
            # Cached by URL: re-importing the same recipe costs one query.
            await mongo[RECIPES].update_one({"url": url}, {"$set": doc}, upsert=True)
        except PyMongoError as exc:
            logger.warning(f"Recipe not cached: {exc}")

    return ImportOut(
        title=doc["title"],
        source_url=url,
        servings=servings,
        ingredients=resolved,
        estimated_total=Decimal(total).quantize(Decimal("0.01")) if total else None,
        unpriced_count=unpriced,
    )


@router.post("/to-list", response_model=BulkAddOut, status_code=201)
async def to_shopping_list(data: AddIn, db: DbSession, user: CurrentUser) -> BulkAddOut:
    lines = [line.model_copy(update={"source": "recipe"}) for line in data.lines]
    items, created, merged = await shopping_service.bulk_add(db, user.id, lines)
    return BulkAddOut(added=created, merged=merged, items=await _enrich(db, items))
