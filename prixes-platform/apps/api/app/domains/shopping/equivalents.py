"""An equivalent product when a shop has no price for the exact one.

A chain rarely has a recorded price for every barcode on a list: Open Prices
is crowd-sourced, so "Lait demi-écrémé Lactel" may be known at Carrefour and
not at Lidl, although Lidl obviously sells milk. Comparing shops on the exact
barcodes alone made most of them look empty (10 items out of 31).

So for each line a shop has no price for, we look for a product with the same
key words in its name that this shop does have a price for, and use the
cheapest one. It is shown as an equivalent, never as the same product.

Guards, because a wrong equivalent is worse than none:
- the key words must all be in the candidate's name ("lait demi écrémé");
- "lait" must not become "lait de coco": a key word followed by "de"/"d'"/"à"
  in the candidate, when it is not in the original, rejects it;
- the price must be in the same range as the original's (0.4× to 2.5×), so a
  single yoghurt never stands in for a pack of twelve;
- loose fruit and vegetables (``fl:``) are already priced per category.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from decimal import Decimal
from statistics import median

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.products.models import PricePoint, Product

# Words that say nothing about what the product is.
_STOP = {
    "de", "du", "des", "la", "le", "les", "et", "au", "aux", "a", "en", "d", "l",
    "un", "une", "pour", "avec", "sans", "bio", "x", "lot", "pack", "format",
    "g", "kg", "mg", "ml", "cl", "litre", "litres", "pc", "pcs",
}
# How many words of the name define the product ("Lait demi-écrémé Lactel 1L"
# -> lait, demi, ecreme). Brand and size come later in a name, if at all.
_KEY_WORDS = 3
_MAX_CANDIDATES = 300
_LOW, _HIGH = Decimal("0.4"), Decimal("2.5")
_ACCENTED = "àâäáãéèêëíìîïóòôöõúùûüçœ"
_PLAIN = "aaaaaeeeeiiiiooooouuuuco"


@dataclass(slots=True)
class Equivalent:
    barcode: str
    label: str
    price: Decimal


def _plain(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def key_words(name: str | None) -> list[str]:
    """The words that say what the product is: "Lait demi-écrémé Lactel 1L" ->
    ["lait", "demi", "ecreme"]."""
    if not name:
        return []
    words = [w for w in re.split(r"[^a-z]+", _plain(name)) if w]
    keys = [w for w in words if w not in _STOP and len(w) >= 3]
    return keys[:_KEY_WORDS]


def _qualified(name: str, word: str) -> bool:
    """True when `word` is followed by "de"/"d'"/"à"/"au" in `name`:
    "lait de coco" is another product than "lait"."""
    return re.search(rf"\b{word}s? (de|d|a|au|aux)\b", name) is not None


def acceptable(original: str, candidate: str, keys: list[str]) -> bool:
    plain_orig, plain_cand = _plain(original), _plain(candidate)
    plain_orig = re.sub(r"[^a-z]+", " ", plain_orig)
    plain_cand = re.sub(r"[^a-z]+", " ", plain_cand)
    if not all(re.search(rf"\b{k}s?\b", plain_cand) for k in keys):
        return False
    # It must be the same kind of thing, named first: "Olives noires" is not
    # "Tapenade olives noires", "Persil" is not "Le Gourmand soja poivre et persil".
    cand_keys = key_words(candidate)
    if not cand_keys or cand_keys[0].rstrip("s") != keys[0].rstrip("s"):
        return False
    return not any(_qualified(plain_cand, k) and not _qualified(plain_orig, k) for k in keys)


async def find_equivalents(
    db: AsyncSession,
    barcode: str,
    name: str | None,
    known_prices: list[Decimal],
    stores: set[str],
) -> dict[str, Equivalent]:
    """The cheapest acceptable equivalent at each of `stores`, when there is one."""
    if not stores or barcode.startswith("fl:"):
        return {}
    keys = key_words(name)
    if not keys or not name:
        return {}
    # Accent-blind on the database side ("écrémé" ~ "ecreme") without needing
    # the unaccent extension; the exact word check happens in `acceptable`.
    folded = func.translate(func.lower(Product.name), _ACCENTED, _PLAIN)
    conditions = [folded.like(f"%{k}%") for k in keys]
    rows = (
        await db.execute(
            select(Product.barcode, Product.name, PricePoint.store, func.min(PricePoint.price))
            .join(PricePoint, PricePoint.barcode == Product.barcode)
            .where(
                and_(*conditions),
                PricePoint.store.in_(stores),
                Product.barcode != barcode,
                Product.name.is_not(None),
            )
            .group_by(Product.barcode, Product.name, PricePoint.store)
            .limit(_MAX_CANDIDATES)
        )
    ).all()

    reference = Decimal(str(median(known_prices))) if known_prices else None
    best: dict[str, Equivalent] = {}
    for cand_barcode, cand_name, store, price in rows:
        if store is None or price is None or not acceptable(name, cand_name, keys):
            continue
        if reference is not None and not (reference * _LOW <= price <= reference * _HIGH):
            continue
        if store not in best or price < best[store].price:
            best[store] = Equivalent(cand_barcode, cand_name, price)
    return best
