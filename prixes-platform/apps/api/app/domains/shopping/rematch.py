"""Fix lines matched to the wrong product before matching knew better.

A line asked as "lait" or "riz" was tied to whatever product had the closest
name: a pack of six litres for "lait, 1 L" (7,02 € on the list), a rice drink
for "riz". Matching now checks the kind of product and the pack size; this
re-runs it on a list's existing lines and swaps a line's product when the new
match fits better and has a price. A product someone picked by its own name
(from search or a product page) is never touched.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.products.models import Product
from app.domains.products.units import to_base_amount
from app.domains.shopping.equivalents import key_words
from app.domains.shopping.models import ShoppingItem
from app.domains.smartcart.resolve import fit_penalty, resolve_lines
from app.domains.smartcart.schemas import AiLine

_UNITS = {"kg", "g", "L", "cl", "ml", "pièce", "tranche", "botte", "sachet", "boîte", "pot"}


async def rematch(db: AsyncSession, owner_id: uuid.UUID) -> int:
    """Re-match the list's unchecked lines; returns how many changed."""
    items = list(
        (
            await db.execute(
                select(ShoppingItem).where(
                    ShoppingItem.user_id == owner_id, ShoppingItem.checked.is_(False)
                )
            )
        ).scalars()
    )
    # One line per product on a list, ticked lines included (unique constraint).
    taken = set(
        (
            await db.execute(
                select(ShoppingItem.barcode).where(
                    ShoppingItem.user_id == owner_id, ShoppingItem.barcode.is_not(None)
                )
            )
        ).scalars()
    )
    changed = 0
    for item in items:
        label = (item.free_text or item.name or "").strip()
        if not label or (item.barcode or "").startswith("fl:"):
            continue
        current = await db.get(Product, item.barcode) if item.barcode else None
        # Picked by hand (search, product page): the person chose this product.
        # A catalogue entry can be named just "Riz" and be a rice drink, so the
        # name alone does not prove a choice; the way it was added does.
        if item.source == "manual" and current is not None and (
            (current.name or "").strip().lower() == label.lower()
        ):
            continue
        unit = item.unit if item.unit in _UNITS else "pièce"
        amount = item.amount if item.amount and item.amount > 0 else Decimal(1)
        needed = to_base_amount(Decimal(amount), unit)
        if current is not None and fit_penalty(label, key_words(label), needed, current) == 0:
            continue  # already the right thing in the right size
        line = AiLine(
            product_name=label, amount=float(amount), unit=unit, category="épicerie salée"
        )
        [best] = await resolve_lines(db, [line], [])
        if not best.barcode or best.best_price is None or best.barcode == item.barcode:
            continue
        if best.barcode in taken:
            continue  # another line already has it (one line per product)
        taken.discard(item.barcode)
        taken.add(best.barcode)
        item.barcode = best.barcode
        item.free_text = None
        item.name = label
        item.quantity = max(1, best.quantity)
        changed += 1
    if changed:
        await db.flush()
    return changed
