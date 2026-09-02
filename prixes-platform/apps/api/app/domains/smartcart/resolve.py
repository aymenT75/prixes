"""Match model-generated lines to real catalog products.

This is where the assistant stops guessing and our own data takes over. The model
says "fromage à raclette, 1,5 kg"; this module decides *which* catalog product
that is, whether we know a price for it, how many packs cover 1,5 kg, and whether
it collides with the user's allergen profile.

Two rules shape the design:

- A line that matches nothing is still returned, as free text. Dropping it would
  hand the user a raclette missing its cheese and no way to notice.
- Allergens are decided here, from ``Product.allergens``, never by the model.
  A generative model is not a food-safety mechanism.
"""
from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass
from decimal import Decimal
from difflib import SequenceMatcher

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.products import service as product_service
from app.domains.products.models import PricePoint, Product
from app.domains.products.units import packs_needed, to_base_amount, unit_price
from app.domains.smartcart.schemas import AiLine, ResolvedLine

# Below this a "match" is noise — better an honest free-text line.
_MIN_SCORE = 0.50
# Bounds applied to whatever the model returned. They live here rather than in
# the schema because the schema we send upstream carries no constraints — see
# core.llm._STRIP_KEYS.
_MAX_NAME = 120
_MAX_AMOUNT = Decimal(9999)
# Above this many packs for one line, the match is the wrong format rather than a
# big shop: 1,8 kg of potatoes matched to a spice sachet asks for 99 packs and
# turns a raclette into a 98 € basket. Ten is the most anyone buys of one thing.
_MAX_PACKS = 10
# Candidates kept per line before the price lookup.
_MAX_CANDIDATES = 8

_PUNCT = re.compile(r"[^a-z0-9 ]+")


def _normalise(text: str) -> str:
    """Lowercase, unaccented, punctuation-free — 'Crème Fraîche' -> 'creme fraiche'."""
    folded = unicodedata.normalize("NFKD", text.lower())
    stripped = "".join(c for c in folded if not unicodedata.combining(c))
    return _PUNCT.sub(" ", stripped).strip()


def _similarity(query: str, name: str) -> float:
    """0..1 name closeness, generous about the catalog's longer labels.

    Catalog names carry brand and format ("Pommes de terre Charlotte 2,5 kg"), so
    a raw ratio against "pommes de terre" scores badly even though it is exactly
    the right product. Containment is therefore worth more than the raw ratio.
    """
    q, n = _normalise(query), _normalise(name)
    if not q or not n:
        return 0.0
    if q == n:
        return 1.0
    ratio = SequenceMatcher(None, q, n).ratio()
    if n.startswith(q):
        return max(ratio, 0.85)
    if q in n:
        return max(ratio, 0.75)
    # All query words present, in any order: "raclette fromage" vs "Fromage à raclette".
    q_words = set(q.split())
    if q_words and q_words <= set(n.split()):
        return max(ratio, 0.70)
    return ratio


def allergen_conflict(product: Product, avoid: set[str]) -> str | None:
    """FR allergen labels the product declares that the user avoids."""
    if not avoid or not product.allergens:
        return None
    declared = [a.strip() for a in product.allergens.split(",") if a.strip()]
    hits = [a for a in declared if _normalise(a) in avoid]
    return ", ".join(hits) if hits else None


def sanitise(lines: list[AiLine]) -> list[AiLine]:
    """Clamp a model answer into the range the rest of the code assumes.

    Dropping a line is preferable to carrying a nonsensical one: a zero or
    negative amount would divide badly downstream, and an absurd amount would
    inflate the basket total. Everything else is trimmed, not rejected.
    """
    clean: list[AiLine] = []
    for line in lines:
        if not math.isfinite(line.amount) or line.amount <= 0:
            continue
        if not line.product_name.strip():
            continue
        clean.append(
            line.model_copy(
                update={
                    "product_name": line.product_name.strip()[:_MAX_NAME],
                    "amount": min(line.amount, float(_MAX_AMOUNT)),
                }
            )
        )
    return clean


def aggregate_lines(lines: list[AiLine]) -> list[AiLine]:
    """Merge repeated ingredients into one line each.

    A week of meals asks for onions in three different recipes; the user wants
    one entry on their list, not three. Amounts are summed through the base unit
    so "200 g" and "1 kg" of the same thing become "1.2 kg".

    Two lines only merge when their amounts are actually commensurable — a
    "pièce" of garlic and 50 g of garlic stay apart rather than being added into
    a meaningless number.
    """
    merged: dict[tuple[str, str], AiLine] = {}
    order: list[tuple[str, str]] = []

    for line in lines:
        base = to_base_amount(Decimal(str(line.amount)), line.unit)
        # Key on the base unit ("kg") when there is one, else on the written unit,
        # so countable and weighable versions of a thing never collide.
        family = base[1] if base else line.unit.lower()
        key = (_normalise(line.product_name), family)

        if key not in merged:
            merged[key] = line.model_copy()
            order.append(key)
            continue

        current = merged[key]
        if base is None:
            total = Decimal(str(current.amount)) + Decimal(str(line.amount))
            merged[key] = current.model_copy(update={"amount": float(total)})
            continue

        current_base = to_base_amount(Decimal(str(current.amount)), current.unit)
        assert current_base is not None  # same family, so it converts too
        total_base = current_base[0] + base[0]
        merged[key] = current.model_copy(
            update={"amount": float(total_base), "unit": family}
        )

    return [merged[key] for key in order]


@dataclass(slots=True)
class _Candidate:
    product: Product
    similarity: float


async def _best_prices(db: AsyncSession, barcodes: list[str]) -> dict[str, Decimal]:
    """Cheapest known price per barcode, in one query rather than one per line."""
    if not barcodes:
        return {}
    rows = await db.execute(
        select(PricePoint.barcode, func.min(PricePoint.price))
        .where(PricePoint.barcode.in_(barcodes))
        .group_by(PricePoint.barcode)
    )
    return {barcode: price for barcode, price in rows.all() if price is not None}


async def resolve_lines(
    db: AsyncSession, lines: list[AiLine], avoid_allergens: list[str]
) -> list[ResolvedLine]:
    avoid = {_normalise(a) for a in avoid_allergens if a.strip()}
    lines = sanitise(lines)

    # Pass 1 — shortlist candidates per line, by name alone.
    shortlists: list[list[_Candidate]] = []
    for line in lines:
        found = await product_service.search_products(db, line.product_name, page=1)
        scored = [
            _Candidate(product=p, similarity=_similarity(line.product_name, p.name or ""))
            for p in found
            if p.name
        ]
        scored.sort(key=lambda c: c.similarity, reverse=True)
        shortlists.append(scored[:_MAX_CANDIDATES])

    # Pass 2 — one price query for every candidate at once.
    prices = await _best_prices(
        db, [c.product.barcode for shortlist in shortlists for c in shortlist]
    )

    # Pass 3 — pick, knowing which candidates we can actually price.
    resolved: list[ResolvedLine] = []
    for line, shortlist in zip(lines, shortlists, strict=True):
        amount = Decimal(str(line.amount))
        out = ResolvedLine(
            product_name=line.product_name,
            amount=amount,
            unit=line.unit,
            category=line.category,
            optional=line.optional,
        )

        best: _Candidate | None = None
        best_score = 0.0
        for candidate in shortlist:
            conflict = allergen_conflict(candidate.product, avoid)
            score = candidate.similarity
            # A product we can price is worth more than a marginally closer name
            # we can't: the whole promise is a costed basket.
            if candidate.product.barcode in prices:
                score += 0.12
            # Never hard-exclude on allergens — surface it instead. An exclusion
            # would silently change the recipe; a warning lets the user choose.
            if conflict:
                score -= 0.15
            if score > best_score:
                best, best_score = candidate, score

        if best is not None and best_score >= _MIN_SCORE:
            product = best.product
            packs = packs_needed(amount, line.unit, product.quantity)
            # An implausible pack count means the match is the wrong format, not a
            # big shop. Keep the line as free text: an honest "prix inconnu" beats
            # a confident total built on a sachet sold by the gram.
            if packs <= _MAX_PACKS:
                price = prices.get(product.barcode)
                out.barcode = product.barcode
                out.matched_name = product.name
                out.image_url = product.image_url
                out.best_price = price
                out.quantity = packs
                out.allergen_warning = allergen_conflict(product, avoid)
                if (per_unit := unit_price(price, product.quantity)) is not None:
                    out.unit_price = f"{per_unit[0]} {per_unit[1]}"

        resolved.append(out)

    return resolved
