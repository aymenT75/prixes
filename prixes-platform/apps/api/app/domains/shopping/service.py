"""Shopping-list service + basket optimizer.

The optimizer answers the question users actually care about: *where do I do this
shop the cheapest?* For every list item we take the lowest recent price per store,
then rank stores by how many items they cover and their basket total.

Since V3 the same costing runs on baskets that were never saved — a generated
week of meals, an imported recipe — so the ranking lives in `optimize_lines`, and
`optimize` is just that function pointed at the user's own list.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from itertools import combinations

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.products import service as product_service
from app.domains.products.models import PricePoint, Product
from app.domains.shopping.models import ShoppingItem
from app.domains.shopping.schemas import (
    BasketItem,
    OptimizeResult,
    ShoppingItemIn,
    ShoppingItemUpdate,
    SplitOption,
    SplitResult,
    StoreBasket,
    StoreBasketDetail,
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


async def _find_duplicate(
    db: AsyncSession, user_id: uuid.UUID, data: ShoppingItemIn
) -> ShoppingItem | None:
    """The row this addition should merge into, if the user already has one."""
    if data.barcode:
        stmt = select(ShoppingItem).where(
            ShoppingItem.user_id == user_id, ShoppingItem.barcode == data.barcode
        )
    else:
        # Case-insensitive: "Tomates" and "tomates" are the same line.
        stmt = select(ShoppingItem).where(
            ShoppingItem.user_id == user_id,
            ShoppingItem.barcode.is_(None),
            func.lower(ShoppingItem.free_text) == (data.free_text or "").lower(),
        )
    return (await db.execute(stmt)).scalars().first()


async def add_item(db: AsyncSession, user_id: uuid.UUID, data: ShoppingItemIn) -> ShoppingItem:
    product = None
    if data.barcode:
        # Ensure the product exists/cached (also backfills name for the list label).
        product = await product_service.get_product(db, data.barcode)

    existing = await _find_duplicate(db, user_id, data)
    if existing is not None:
        existing.quantity = min(99, existing.quantity + data.quantity)
        await db.flush()
        return existing

    item = ShoppingItem(
        user_id=user_id,
        barcode=data.barcode,
        free_text=data.free_text,
        quantity=data.quantity,
        amount=data.amount,
        unit=data.unit,
        source=data.source,
        name=data.name or (product.name if product else None) or data.free_text,
    )
    db.add(item)
    await db.flush()
    return item


async def bulk_add(
    db: AsyncSession, user_id: uuid.UUID, lines: list[ShoppingItemIn]
) -> tuple[list[ShoppingItem], int, int]:
    """Add a whole basket. Returns (items, created, merged).

    Merging rather than duplicating matters here: a week of meals routinely asks
    for onions three times, and the user wants one line, not three.
    """
    created = merged = 0
    items: list[ShoppingItem] = []
    for line in lines:
        before = await _find_duplicate(db, user_id, line)
        item = await add_item(db, user_id, line)
        if before is None:
            created += 1
        else:
            merged += 1
        items.append(item)
    return items, created, merged


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


@dataclass(slots=True)
class PricedLine:
    """One basket line with the cheapest price we know at each store."""

    barcode: str
    quantity: int
    label: str
    per_store: dict[str, Decimal]


def _merge_by_barcode(lines: list[tuple[str, int, str]]) -> list[tuple[str, int, str]]:
    """One product, one line — however many callers asked for it.

    A week of meals can ask for potatoes on Monday and again on Thursday, and
    both resolve to the same product. Left alone, the store basket printed
    "Pommes de terre 1,30 €" twice, which reads as a bug rather than as two
    dinners. Quantities add up; the first label wins because it is the one the
    caller chose to show.
    """
    merged: dict[str, tuple[str, int, str]] = {}
    for barcode, quantity, display in lines:
        if (kept := merged.get(barcode)) is None:
            merged[barcode] = (barcode, quantity, display)
        else:
            merged[barcode] = (barcode, kept[1] + quantity, kept[2])
    return list(merged.values())


async def price_lines(
    db: AsyncSession, lines: list[tuple[str, int, str]]
) -> list[PricedLine]:
    """Look up every line's per-store price once.

    Both the store ranking and the store split read from this, so they can never
    disagree about what something costs.
    """
    priced: list[PricedLine] = []
    for barcode, quantity, display in _merge_by_barcode(lines):
        prices = list(
            (
                await db.execute(
                    select(PricePoint)
                    .where(PricePoint.barcode == barcode)
                    .order_by(PricePoint.created_at.desc())
                    .limit(_RECENT_PRICES)
                )
            ).scalars()
        )
        product = await db.get(Product, barcode)
        priced.append(
            PricedLine(
                barcode=barcode,
                quantity=quantity,
                label=display or (product.name if product else None) or barcode,
                per_store=_lowest_price_per_store(prices),
            )
        )
    return priced


async def optimize_lines(
    db: AsyncSession, lines: list[tuple[str, int, str]]
) -> OptimizeResult:
    """Rank stores for an arbitrary basket of (barcode, quantity, label).

    Works the same whether the basket is a saved list, a generated week of meals
    or an imported recipe — nothing here reads the shopping_items table.
    """
    if not lines:
        return OptimizeResult(by_store=[], priced_items=0, unpriced_items=0)

    # store -> running basket total; store -> set of covered barcodes.
    store_total: dict[str, Decimal] = defaultdict(lambda: Decimal(0))
    store_covered: dict[str, set[str]] = defaultdict(set)
    label: dict[str, str] = {}  # barcode -> display name for "missing" lists

    priced = 0
    split_total = Decimal(0)

    for line in await price_lines(db, lines):
        barcode, quantity = line.barcode, line.quantity
        label[barcode] = line.label

        per_store = line.per_store
        if not per_store:
            continue

        priced += 1
        for store, price in per_store.items():
            store_total[store] += price * quantity
            store_covered[store].add(barcode)
        # Cheapest-split: best price anywhere for this item.
        split_total += min(per_store.values()) * quantity

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
        unpriced_items=len(lines) - priced,
    )


async def optimize(db: AsyncSession, user_id: uuid.UUID) -> OptimizeResult:
    items = await list_items(db, user_id)
    # Only unchecked items with a real product are part of "what I still need to
    # buy" — a free-text line has no price to compare, so it can't rank a store.
    lines = [
        (i.barcode, i.quantity, i.label) for i in items if not i.checked and i.barcode
    ]
    result = await optimize_lines(db, lines)
    # Free-text lines are still things the user has to buy: count them as unpriced
    # rather than pretending the basket is smaller than it is.
    free_text_count = sum(1 for i in items if not i.checked and not i.barcode)
    result.unpriced_items += free_text_count
    return result


# Combinations grow with the number of stores, so only the widest-stocked ones
# are considered. A chain that carries two items out of twenty is never going to
# win a slot, and 12 stores keeps every pair at 66 combinations.
_SPLIT_CANDIDATE_STORES = 12


def _rank(covered: int, total: Decimal) -> tuple[int, Decimal]:
    """Coverage first, then price.

    Ranking on price alone would crown the pair of stores that happens to stock
    the fewest of your items, because a basket you cannot fill is always cheaper.
    """
    return (-covered, total)


def _evaluate(lines: list[PricedLine], stores: tuple[str, ...]) -> tuple[int, Decimal]:
    covered = 0
    total = Decimal(0)
    for line in lines:
        offers = [line.per_store[s] for s in stores if s in line.per_store]
        if offers:
            covered += 1
            total += min(offers) * line.quantity
    return covered, total


def _allocate(lines: list[PricedLine], stores: tuple[str, ...]) -> SplitOption:
    """Assign each line to whichever of `stores` sells it cheapest."""
    baskets: dict[str, list[BasketItem]] = {store: [] for store in stores}
    missing: list[str] = []
    total = Decimal(0)

    for line in lines:
        offers = {s: line.per_store[s] for s in stores if s in line.per_store}
        if not offers:
            missing.append(line.label)
            continue
        # Ties go to the first store in the option, which keeps one basket from
        # being split down the middle for no gain.
        store = min(offers, key=lambda s: (offers[s], stores.index(s)))
        price = offers[store]
        line_total = (price * line.quantity).quantize(Decimal("0.01"))
        total += line_total
        baskets[store].append(
            BasketItem(
                barcode=line.barcode,
                label=line.label,
                quantity=line.quantity,
                unit_price=price,
                line_total=line_total,
            )
        )

    details = [
        StoreBasketDetail(
            store=store,
            items=items,
            subtotal=sum((i.line_total for i in items), Decimal(0)).quantize(Decimal("0.01")),
        )
        for store, items in baskets.items()
        # A second store earns its place only if something lands in it.
        if items
    ]
    details.sort(key=lambda b: b.subtotal, reverse=True)

    priced_lines = [line for line in lines if line.per_store]
    return SplitOption(
        stores=[b.store for b in details],
        baskets=details,
        total=total.quantize(Decimal("0.01")),
        items_covered=len(priced_lines) - len(missing),
        items_total=len(priced_lines),
        missing=missing,
    )


async def split_lines(
    db: AsyncSession, lines: list[tuple[str, int, str]], max_stores: int = 2
) -> SplitResult:
    """Turn a basket into one shop per store, and say what the extra stop saves.

    The question this answers is not "which store is cheapest" — that is
    `optimize_lines` — but "what do I put in which trolley". Every option is a
    complete plan: each line sits in exactly one basket, at a real price.
    """
    priced = await price_lines(db, lines)
    unpriced = [line.label for line in priced if not line.per_store]
    sellable = [line for line in priced if line.per_store]
    if not sellable:
        return SplitResult(options=[], unpriced=unpriced)

    # Rank stores by how much of the basket they carry, and keep the top ones.
    coverage: dict[str, int] = defaultdict(int)
    for line in sellable:
        for store in line.per_store:
            coverage[store] += 1
    candidates = tuple(
        sorted(coverage, key=lambda s: (-coverage[s], s))[:_SPLIT_CANDIDATE_STORES]
    )

    options: list[SplitOption] = []
    for size in range(1, min(max_stores, len(candidates)) + 1):
        best = min(
            combinations(candidates, size),
            key=lambda combo: _rank(*_evaluate(sellable, combo)),
        )
        option = _allocate(sellable, best)
        # Two stores that behave like one (everything lands in a single basket)
        # is not a second option, it is the first one repeated.
        if any(len(o.stores) == len(option.stores) for o in options):
            continue
        options.append(option)

    single = next((o for o in options if len(o.stores) == 1), None)
    if single is not None:
        for option in options:
            if option is single:
                continue
            option.extra_items = option.items_covered - single.items_covered
            # A price difference only means something between plans that buy the
            # same things. When the second store adds items the first one does not
            # stock, the higher total is those items — not a worse deal — and
            # quoting it as a saving produced "économisez −8,13 €".
            if option.extra_items == 0:
                option.saving_vs_single = (single.total - option.total).quantize(
                    Decimal("0.01")
                )

    return SplitResult(options=options, unpriced=unpriced)


async def split(
    db: AsyncSession, user_id: uuid.UUID, max_stores: int = 2
) -> SplitResult:
    items = await list_items(db, user_id)
    lines = [
        (i.barcode, i.quantity, i.label) for i in items if not i.checked and i.barcode
    ]
    result = await split_lines(db, lines, max_stores)
    # Free-text lines have no price anywhere; they still have to be bought.
    result.unpriced += [i.label for i in items if not i.checked and not i.barcode]
    return result
