"""Read a recipe out of a page's structured data, then out of its ingredient lines.

Cookidoo, Marmiton, 750g and most recipe sites publish a schema.org/Recipe block
as JSON-LD, because that is what search engines read. Taking the same block is
free, exact, and needs no model call — which is why the import is cheap enough to
be unlimited.

We keep the title, the ingredient list and the source URL. Not the method: the
steps are the author's copyrighted text, and we have no licence to store them.
"""
from __future__ import annotations

import json
import logging
import re
from decimal import Decimal, InvalidOperation
from typing import Any

from app.domains.smartcart.schemas import AiLine

logger = logging.getLogger(__name__)

_SCRIPT = re.compile(
    r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)
_TAGS = re.compile(r"<[^>]+>")

# "500 g de farine", "2 c. à soupe d'huile", "1,5 kg de pommes de terre", "3 oeufs"
_INGREDIENT = re.compile(
    r"^\s*(?P<amount>\d+(?:[.,]\d+)?)?\s*"
    # Longest first, then a boundary: with "g" earlier in the alternation,
    # "2 gousses d'ail" matched "g" and left "ousses d'ail" as the product name.
    # The boundary sits *inside* the optional group: outside it, a line with no
    # unit at all ("persil frais") would be rejected instead of parsed.
    r"(?:(?P<unit>litres?|grammes?|pinc[ée]es?|cuill[èe]res?|gousses?|bottes?|"
    r"branches?|tranches?|sachets?|bo[îi]tes?|pots?|pi[èe]ces?|tasses?|verres?|"
    r"c\.?\s*[àa]\s*[sc]\.?|kg|mg|cl|ml|dl|g|l)(?=[\s]|$))?\s*"
    r"(?:d[eu']\s*|des\s+|d’)?\s*(?P<name>.+?)\s*$",
    re.IGNORECASE,
)

# Written unit → the unit vocabulary our schema allows.
_UNIT_MAP = {
    "kg": "kg", "g": "g", "gramme": "g", "grammes": "g", "mg": "g",
    "l": "L", "litre": "L", "litres": "L", "cl": "cl", "ml": "ml", "dl": "cl",
    "gousse": "pièce", "gousses": "pièce", "botte": "botte", "bottes": "botte",
    "branche": "pièce", "branches": "pièce", "tranche": "tranche", "tranches": "tranche",
    "sachet": "sachet", "sachets": "sachet", "boîte": "boîte", "boite": "boîte",
    "boîtes": "boîte", "boites": "boîte", "pot": "pot", "pots": "pot",
    "pièce": "pièce", "pièces": "pièce", "piece": "pièce", "pieces": "pièce",
}

# Things nobody needs on a shopping list.
_PANTRY_STAPLES = {"sel", "poivre", "eau", "huile", "sel fin", "gros sel", "poivre moulu"}


def _blocks(html: str) -> list[Any]:
    """Every JSON-LD document in the page, parsed. Malformed ones are skipped."""
    found: list[Any] = []
    for raw in _SCRIPT.findall(html):
        try:
            found.append(json.loads(raw.strip()))
        except json.JSONDecodeError:
            continue
    return found


def _is_recipe(node: Any) -> bool:
    if not isinstance(node, dict):
        return False
    types = node.get("@type")
    if isinstance(types, str):
        return types.lower() == "recipe"
    if isinstance(types, list):
        return any(isinstance(t, str) and t.lower() == "recipe" for t in types)
    return False


def find_recipe(html: str) -> dict[str, Any] | None:
    """The first schema.org Recipe node, wherever it is nested."""
    queue: list[Any] = _blocks(html)
    seen = 0
    while queue and seen < 500:  # a page can nest deeply; don't walk forever
        node = queue.pop(0)
        seen += 1
        if _is_recipe(node):
            return node  # type: ignore[no-any-return]
        if isinstance(node, dict):
            queue.extend(node.values())
        elif isinstance(node, list):
            queue.extend(node)
    return None


def _clean(text: str) -> str:
    return _TAGS.sub(" ", text).replace("\xa0", " ").strip(" .,;·-")


def parse_ingredient(text: str) -> AiLine | None:
    """Turn "500 g de farine" into a line our resolver understands.

    Falls back to a single unit when there is no readable quantity — "quelques
    brins de persil" is still persil, and a missing amount is better than a
    dropped ingredient.
    """
    cleaned = _clean(text)
    if not cleaned or len(cleaned) > 200:
        return None
    match = _INGREDIENT.match(cleaned)
    if match is None:
        return None

    name = _clean(match.group("name") or "")
    if not name or name.lower() in _PANTRY_STAPLES:
        return None

    raw_unit = (match.group("unit") or "").lower().strip(". ")
    unit = _UNIT_MAP.get(raw_unit, "pièce")
    # Spoons and pinches are seasoning quantities, not shopping quantities.
    if raw_unit.startswith(("cuill", "c.", "ca", "cs", "pinc", "tasse", "verre")):
        unit = "pièce"

    try:
        amount = Decimal((match.group("amount") or "1").replace(",", "."))
    except InvalidOperation:
        amount = Decimal(1)
    if amount <= 0:
        amount = Decimal(1)

    return AiLine(
        product_name=name[:120],
        amount=float(amount),
        unit=unit,
        category="épicerie salée",  # the aisle is cosmetic; resolution decides the product
        optional=False,
    )


def servings_from(node: dict[str, Any]) -> int:
    """recipeYield is a free-for-all: 4, "4", "4 personnes", ["4", "4 parts"]."""
    value = node.get("recipeYield") or node.get("yield")
    if isinstance(value, list):
        value = value[0] if value else None
    if isinstance(value, int):
        return max(1, min(50, value))
    if isinstance(value, str) and (digits := re.search(r"\d+", value)):
        return max(1, min(50, int(digits.group())))
    return 4


def ingredients_from(node: dict[str, Any]) -> list[AiLine]:
    raw = node.get("recipeIngredient") or node.get("ingredients") or []
    if isinstance(raw, str):
        raw = [raw]
    lines: list[AiLine] = []
    for entry in raw[:60]:
        if not isinstance(entry, str):
            continue
        if (line := parse_ingredient(entry)) is not None:
            lines.append(line)
    return lines


def title_from(node: dict[str, Any]) -> str:
    name = node.get("name")
    if isinstance(name, list):
        name = name[0] if name else None
    return _clean(str(name))[:120] if name else "Recette importée"
