"""Shopping-list HTTP API — per-user list + basket optimizer."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.core.redis import redis_client
from app.domains.mealplan.auto import ready_key
from app.domains.products.models import PricePoint, Product
from app.domains.shopping import service
from app.domains.shopping.models import ShoppingItem
from app.domains.shopping.schemas import (
    BulkAddIn,
    BulkAddOut,
    DropOut,
    NewsOut,
    ShoppingItemIn,
    ShoppingItemOut,
    ShoppingItemUpdate,
    ShoppingListOut,
    SplitResult,
)
from app.domains.shopping.watch import recent_drops

router = APIRouter(prefix="/shopping", tags=["shopping"])


async def _enrich(db: DbSession, items: list[ShoppingItem]) -> list[ShoppingItemOut]:
    out: list[ShoppingItemOut] = []
    for it in items:
        dto = ShoppingItemOut.model_validate(it)
        # A free-text line has no barcode, so no product and no price to look up.
        if it.barcode:
            product = await db.get(Product, it.barcode)
            best = (
                await db.execute(
                    select(PricePoint.price)
                    .where(PricePoint.barcode == it.barcode)
                    .order_by(PricePoint.price.asc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            dto.image_url = product.image_url if product else None
            dto.best_price = best
            dto.nutriscore = product.nutriscore if product else None
            dto.pack = product.quantity if product else None
        out.append(dto)
    return out


@router.get("", response_model=ShoppingListOut)
async def get_list(db: DbSession, user: CurrentUser) -> ShoppingListOut:
    items = await service.list_items(db, user.id)
    enriched = await _enrich(db, items)
    return ShoppingListOut(items=enriched, total=len(enriched))


@router.get("/news", response_model=NewsOut)
async def news(user: CurrentUser) -> NewsOut:
    """What happened while the app was closed: the list's recent price drops and
    a Sunday menu waiting to be looked at. The app says it when it opens."""
    ready = await redis_client.get(ready_key(user.id))
    return NewsOut(
        drops=[DropOut(**d) for d in await recent_drops(user.id)],
        menu_ready=(ready.decode() if isinstance(ready, bytes) else ready) or None,
    )


@router.post("/news/menu-seen", status_code=204)
async def menu_seen(user: CurrentUser) -> None:
    """The Sunday menu was offered: don't offer it again at every opening."""
    await redis_client.delete(ready_key(user.id))


@router.post("", response_model=ShoppingItemOut, status_code=201)
async def add(data: ShoppingItemIn, db: DbSession, user: CurrentUser) -> ShoppingItemOut:
    item = await service.add_item(db, user.id, data)
    return (await _enrich(db, [item]))[0]


@router.post("/bulk", response_model=BulkAddOut, status_code=201)
async def bulk_add(data: BulkAddIn, db: DbSession, user: CurrentUser) -> BulkAddOut:
    """Add a whole basket in one call — the assistant and the meal planner."""
    items, created, merged = await service.bulk_add(db, user.id, data.items)
    return BulkAddOut(added=created, merged=merged, items=await _enrich(db, items))


@router.patch("/{item_id}", response_model=ShoppingItemOut)
async def update(
    item_id: uuid.UUID, data: ShoppingItemUpdate, db: DbSession, user: CurrentUser
) -> ShoppingItemOut:
    item = await service.update_item(db, user.id, item_id, data)
    return (await _enrich(db, [item]))[0]


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(item_id: uuid.UUID, db: DbSession, user: CurrentUser) -> None:
    await service.delete_item(db, user.id, item_id)


@router.post("/clear-checked")
async def clear_checked(db: DbSession, user: CurrentUser) -> dict[str, int]:
    removed = await service.clear_checked(db, user.id)
    return {"removed": removed}


@router.get("/split", response_model=SplitResult)
async def split(
    db: DbSession,
    user: CurrentUser,
    max_stores: Annotated[int, Query(ge=1, le=3)] = 2,
) -> SplitResult:
    """One trolley per store: what to buy where, and what the second stop saves."""
    return await service.split(db, user.id, max_stores)


