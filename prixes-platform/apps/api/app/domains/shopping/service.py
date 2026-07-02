"""Shopping-list service + basket optimizer.

The optimizer answers the question users actually care about: *where do I do this
shop the cheapest?* For every list item we take the lowest recent price per store,
then rank stores by how many items they cover and their basket total.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.products import service as product_service
from app.domains.products.models import PricePoint, Product
from app.domains.shopping.models import ShoppingItem
from app.domains.shopping.schemas import (
    OptimizeResult,
    ShoppingItemIn,
    ShoppingItemUpdate,
    StoreBasket,
)

# How many recent price points to consider per product when optimising.
_RECENT_PRICES = 100


async def list_items(db: AsyncSession, user_id: uuid.UUID) -> list[ShoppingItem]:
    return list(
        (
            await db.execute(
                select(ShoppingItem)
                .where(ShoppingItem.user_id == user_id)
                .order_by(ShoppingItem.created_at.desc())
            )
        ).scalars()
    )


async def add_item(db: AsyncSession, user_id: uuid.UUID, data: ShoppingItemIn) -> ShoppingItem:
    # Ensure the product exists/cached (also backfills name for the list label).
    product = await product_service.get_product(db, data.barcode)
    existing = (
        await db.execute(
            select(ShoppingItem).where(
                ShoppingItem.user_id == user_id, ShoppingItem.barcode == data.barcode
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        existing.quantity = min(99, existing.quantity + data.quantity)
        await db.flush()
        return existing

    item = ShoppingItem(
        user_id=user_id,
        barcode=data.barcode,
        quantity=data.quantity,
        name=data.name or (product.name if product else None),
    )
    db.add(item)
    await db.flush()
    return item


async def update_item(
    db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID, data: ShoppingItemUpdate
) -> ShoppingItem:
    item = await _owned(db, user_id, item_id)
    if data.quantity is not None:
        item.quantity = data.quantity
    if data.checked is not None:
        item.checked = data.checked
    await db.flush()
    return item


async def delete_item(db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID) -> None:
    item = await _owned(db, user_id, item_id)
    await db.delete(item)


async def clear_checked(db: AsyncSession, user_id: uuid.UUID) -> int:
    items = [
        i
        for i in await list_items(db, user_id)
        if i.checked
    ]
    for i in items:
        await db.delete(i)
    return len(items)


async def _owned(db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID) -> ShoppingItem:
    item = await db.get(ShoppingItem, item_id)
    if item is None or item.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")
    return item


def _lowest_price_per_store(prices: list[PricePoint]) -> dict[str, Decimal]:
    """Lowest observed price for each named store."""
    best: dict[str, Decimal] = {}
    for p in prices:
        if not p.store or p.price is None:
            continue
        if p.store not in best or p.price < best[p.store]:
            best[p.store] = p.price
    return best


async def optimize(db: AsyncSession, user_id: uuid.UUID) -> OptimizeResult:
    items = await list_items(db, user_id)
    # Only unchecked items are part of "what I still need to buy".
    items = [i for i in items if not i.checked]
    if not items:
        return OptimizeResult(by_store=[], priced_items=0, unpriced_items=0)

    # store -> running basket total; store -> set of covered barcodes.
    store_total: dict[str, Decimal] = defaultdict(lambda: Decimal(0))
    store_covered: dict[str, set[str]] = defaultdict(set)
    label: dict[str, str] = {}  # barcode -> display name for "missing" lists

    priced = 0
    split_total = Decimal(0)

    for item in items:
        prices = list(
            (
                await db.execute(
                    select(PricePoint)
                    .where(PricePoint.barcode == item.barcode)
                    .order_by(PricePoint.created_at.desc())
                    .limit(_RECENT_PRICES)
                )
            ).scalars()
        )
        product = await db.get(Product, item.barcode)
        label[item.barcode] = item.name or (product.name if product else None) or item.barcode

        per_store = _lowest_price_per_store(prices)
        if not per_store:
            continue

        priced += 1
        for store, price in per_store.items():
            store_total[store] += price * item.quantity
            store_covered[store].add(item.barcode)
        # Cheapest-split: best price anywhere for this item.
        split_total += min(per_store.values()) * item.quantity

    priced_barcodes = {b for b in label if any(b in c for c in store_covered.values())}
    priced_count = len(priced_barcodes)

    baskets: list[StoreBasket] = []
    for store, total in store_total.items():
        covered = store_covered[store]
        missing = [label[b] for b in priced_barcodes if b not in covered]
        baskets.append(
            StoreBasket(
                store=store,
                total=total.quantize(Decimal("0.01")),
                items_covered=len(covered),
                items_total=priced_count,
                missing=missing,
            )
        )

    # Rank: most coverage first, then cheapest.
    baskets.sort(key=lambda b: (-b.items_covered, b.total))
    best_single = next((b for b in baskets if b.items_covered == priced_count), None)

    return OptimizeResult(
        best_single_store=best_single,
        by_store=baskets,
        cheapest_split_total=split_total.quantize(Decimal("0.01")) if priced else None,
        priced_items=priced,
        unpriced_items=len(items) - priced,
    )
