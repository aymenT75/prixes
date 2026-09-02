"""Parse OpenFoodFacts `quantity` strings into a normalised base amount.

The goal is a fair per-unit price (€/kg, €/L, €/pièce) so a 1 L bottle and a
500 ml bottle can be compared honestly. OFF quantity strings are messy
("1L", "500 g", "6 x 33 cl", "250g", "1,5 kg", "lot de 4"), so we parse
defensively and simply give up (return None) when we can't be confident.
"""
from __future__ import annotations

import re
from decimal import ROUND_CEILING, Decimal, InvalidOperation

# Conversion of a written unit → (base unit label, factor to reach 1 base unit).
# Mass normalises to kg, volume to L.
_UNIT_FACTORS: dict[str, tuple[str, Decimal]] = {
    "kg": ("kg", Decimal(1)),
    "g": ("kg", Decimal("0.001")),
    "mg": ("kg", Decimal("0.000001")),
    "l": ("L", Decimal(1)),
    "cl": ("L", Decimal("0.01")),
    "ml": ("L", Decimal("0.001")),
    "dl": ("L", Decimal("0.1")),
}

_UNIT_LABELS = {"kg": "€/kg", "L": "€/L", "piece": "€/pièce"}

# Units that count objects rather than measure them.
_COUNTABLE = {"pièce", "piece", "tranche", "botte", "sachet", "boîte", "pot"}

# "6 x 33 cl", "4x25cl", "lot de 6"
_MULTIPACK = re.compile(r"(\d+)\s*[x×]\s*", re.IGNORECASE)
_LOT = re.compile(r"lot\s+de\s+(\d+)", re.IGNORECASE)
# "500 g", "1,5 kg", "33cl"
_AMOUNT = re.compile(r"(\d+(?:[.,]\d+)?)\s*(kg|mg|g|cl|ml|dl|l)\b", re.IGNORECASE)


def parse_quantity(quantity: str | None) -> tuple[Decimal, str] | None:
    """Return (total_base_amount, base_unit_label) or None.

    base_unit_label is one of "kg" | "L" | "piece". For a multipack the amount
    is multiplied out (e.g. "6 x 33 cl" → 1.98 L).
    """
    if not quantity:
        return None
    q = quantity.strip().lower()

    multiplier = 1
    if (m := _MULTIPACK.search(q)) or (m := _LOT.search(q)):
        multiplier = int(m.group(1))

    if m := _AMOUNT.search(q):
        try:
            value = Decimal(m.group(1).replace(",", "."))
        except InvalidOperation:
            return None
        base_unit, factor = _UNIT_FACTORS[m.group(2).lower()]
        total = value * factor * multiplier
        if total <= 0:
            return None
        return total, base_unit

    return None


def to_base_amount(amount: Decimal, unit: str) -> tuple[Decimal, str] | None:
    """Normalise a written amount ("1,5", "kg") to the same base as parse_quantity.

    Returns (amount_in_base, "kg" | "L") or None for anything countable — a
    "pièce", a "botte", a "sachet" — which has no mass or volume to convert.
    Used to turn a recipe quantity into a number of packs to buy.
    """
    factor = _UNIT_FACTORS.get(unit.strip().lower())
    if factor is None:
        return None
    base_unit, multiplier = factor
    total = amount * multiplier
    if total <= 0:
        return None
    return total, base_unit


def packs_needed(amount: Decimal, unit: str, pack_quantity: str | None) -> int:
    """How many packs of `pack_quantity` cover `amount` `unit`. At least 1.

    "1,5 kg" of a product sold in 400 g packs is 4 packs — that integer, not the
    1.5, is what the basket costing must multiply by the price.
    Falls back to 1 whenever either side can't be parsed, which is the safe
    direction: we would rather under-count than invent a total.
    """
    needed = to_base_amount(amount, unit)
    if needed is None:
        # Countable unit: "6 pièces" is 6 items, anything else is one.
        return max(1, min(99, int(amount))) if unit.lower() in _COUNTABLE else 1
    pack = parse_quantity(pack_quantity)
    if pack is None or pack[1] != needed[1] or pack[0] <= 0:
        return 1
    count = (needed[0] / pack[0]).to_integral_value(rounding=ROUND_CEILING)
    return max(1, min(99, int(count)))


def unit_price(price: Decimal | float | None, quantity: str | None) -> tuple[Decimal, str] | None:
    """Return (price_per_base_unit, "€/kg"|"€/L"|"€/pièce") or None.

    Rounded to 2 decimals for display.
    """
    if price is None:
        return None
    parsed = parse_quantity(quantity)
    if parsed is None:
        return None
    amount, base_unit = parsed
    try:
        per = (Decimal(str(price)) / amount).quantize(Decimal("0.01"))
    except (InvalidOperation, ZeroDivisionError):
        return None
    return per, _UNIT_LABELS[base_unit]
