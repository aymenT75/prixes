"""Parse OpenFoodFacts `quantity` strings into a normalised base amount.

The goal is a fair per-unit price (€/kg, €/L, €/pièce) so a 1 L bottle and a
500 ml bottle can be compared honestly. OFF quantity strings are messy
("1L", "500 g", "6 x 33 cl", "250g", "1,5 kg", "lot de 4"), so we parse
defensively and simply give up (return None) when we can't be confident.
"""
from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

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
