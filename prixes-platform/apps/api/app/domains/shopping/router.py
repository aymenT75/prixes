"""Shopping-list HTTP API — per-user list + basket optimizer."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.domains.products.models import PricePoint, Product
from app.domains.shopping import service
from app.domains.shopping.schemas import (
    OptimizeResult,
    ShoppingItemIn,
    ShoppingItemOut,
    ShoppingItemUpdate,
    ShoppingListOut,
)

router = APIRouter(prefix="/shopping", tags=["shopping"])


async def _enrich(db: DbSession, items: list) -> list[ShoppingItemOut]:
    out: list[ShoppingItemOut] = []
    for it in items:
        product = await db.get(Product, it.barcode)
        best = (
            await db.execute(
                select(PricePoint.price)
                .where(PricePoint.barcode == it.barcode)
                .order_by(PricePoint.price.asc())
                .limit(1)
            )
        ).scalar_one_or_none()
        dto = ShoppingItemOut.model_validate(it)
        dto.image_url = product.image_url if product else None
        dto.best_price = best
        out.append(dto)
    return out


@router.get("", response_model=ShoppingListOut)
async def get_list(db: DbSession, user: CurrentUser) -> ShoppingListOut:
    items = await service.list_items(db, user.id)
    enriched = await _enrich(db, items)
    return ShoppingListOut(items=enriched, total=len(enriched))


@router.post("", response_model=ShoppingItemOut, status_code=201)
async def add(data: ShoppingItemIn, db: DbSession, user: CurrentUser) -> ShoppingItemOut:
    item = await service.add_item(db, user.id, data)
    return (await _enrich(db, [item]))[0]


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


@router.get("/optimize", response_model=OptimizeResult)
async def optimize(db: DbSession, user: CurrentUser) -> OptimizeResult:
    return await service.optimize(db, user.id)
