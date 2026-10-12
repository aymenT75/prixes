"""The cupboard: what the household already has, so lists skip it.

"Je l'ai déjà" on a line of the list (or a menu ingredient) puts it here and
takes it off the list. For two weeks, lists built by the assistant, the
recipes and the weekly menu leave it out, and the menu is asked to use it
first. What it saved counts in the week's savings.
"""
from __future__ import annotations

import re
import unicodedata
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.shopping.models import PantryItem
from app.domains.shopping.schemas import PantryIn, ShoppingItemIn

# How long "I have it" holds before the product comes back on lists.
KEEP = timedelta(days=14)


def plain(name: str | None) -> str:
    """"Riz basmati 1 kg" and "riz basmati" match; accents and case do not count."""
    if not name:
        return ""
    decomposed = unicodedata.normalize("NFKD", name.lower())
    text = "".join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r"[^a-z]+", " ", text).strip()


def _since(now: datetime | None = None) -> datetime:
    # created_at is mapped without a time zone (TimestampMixin): naive UTC.
    return ((now or datetime.now(UTC)) - KEEP).replace(tzinfo=None)


async def active(db: AsyncSession, owner_id: uuid.UUID) -> list[PantryItem]:
    rows = await db.execute(
        select(PantryItem)
        .where(PantryItem.owner_id == owner_id, PantryItem.created_at >= _since())
        .order_by(PantryItem.created_at.desc())
    )
    return list(rows.scalars())


async def add(db: AsyncSession, owner_id: uuid.UUID, data: PantryIn) -> PantryItem:
    # Said twice, kept once (and its two weeks start again).
    for old in await active(db, owner_id):
        if (data.barcode and old.barcode == data.barcode) or plain(old.name) == plain(data.name):
            await db.delete(old)
    item = PantryItem(owner_id=owner_id, barcode=data.barcode, name=data.name, avoided=data.avoided)
    db.add(item)
    await db.flush()
    return item


async def remove(db: AsyncSession, owner_id: uuid.UUID, item_id: uuid.UUID) -> None:
    item = await db.get(PantryItem, item_id)
    if item is None or item.owner_id != owner_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pas dans le placard")
    await db.delete(item)


def _keys(items: list[PantryItem]) -> tuple[set[str], set[str]]:
    return {i.barcode for i in items if i.barcode}, {plain(i.name) for i in items}


def has(line: ShoppingItemIn, barcodes: set[str], names: set[str]) -> bool:
    if line.barcode and line.barcode in barcodes:
        return True
    name = plain(line.name or line.free_text)
    # "riz" in the cupboard covers "riz basmati" on a recipe, not the reverse.
    return bool(name) and any(n and (name == n or name.startswith(n + " ")) for n in names)


async def skip_what_we_have(
    db: AsyncSession, owner_id: uuid.UUID, lines: list[ShoppingItemIn]
) -> tuple[list[ShoppingItemIn], list[str]]:
    """The lines to add, and the names left out because they are in the cupboard."""
    items = await active(db, owner_id)
    if not items:
        return lines, []
    barcodes, names = _keys(items)
    keep, skipped = [], []
    for line in lines:
        if has(line, barcodes, names):
            skipped.append(line.name or line.free_text or line.barcode or "")
        else:
            keep.append(line)
    return keep, skipped


async def names(db: AsyncSession, owner_id: uuid.UUID) -> list[str]:
    return [i.name for i in await active(db, owner_id)]


async def avoided_since(db: AsyncSession, owner_id: uuid.UUID, since: datetime) -> Decimal:
    total = await db.scalar(
        select(func.coalesce(func.sum(PantryItem.avoided), 0)).where(
            PantryItem.owner_id == owner_id, PantryItem.created_at >= since
        )
    )
    return Decimal(total or 0)


async def forget(db: AsyncSession, owner_id: uuid.UUID) -> None:
    await db.execute(delete(PantryItem).where(PantryItem.owner_id == owner_id))
