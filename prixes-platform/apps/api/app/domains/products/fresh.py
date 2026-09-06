"""Fruits et légumes vendus au poids — les produits que le code-barres ignore.

Everything else in this app is keyed by an EAN, because that is how packaged
groceries are identified. Loose produce has no EAN: potatoes, onions, courgettes
and carrots are weighed at the till, so they were entirely absent from the
catalogue. That is why a raclette for six costed out at 4,99 € and a week of
meals priced six ingredients out of nineteen — not because prices were missing,
but because the *ingredients of home cooking* were.

Open Prices — the source already behind every price in the app — records these
too, keyed by an Open Food Facts category (`en:potatoes`) with `price_per`
KILOGRAM and a real shop. Roughly 6 300 such readings exist for France across the
usual chains. Reading them needs no new dependency, no scraping and no new
licence question: it is the same feed, one filter away.

Two decisions shape the rest of this module.

**A category becomes a product.** Rather than a parallel "category price" concept
threaded through search, the basket splitter, price history and alerts, each
curated category is stored as an ordinary `Product` under a synthetic code
(`fl:potatoes`). Every existing feature then works on it unchanged.

**A pack is a purchase increment, not a kilo.** Prices arrive per kilogram, but
a recipe asking for 30 g of garlic must not cost a kilo of garlic. Each category
declares the amount people actually put in the basket — half a kilo of potatoes,
a hundred grams of ginger — and the stored price is scaled to it. Rounding then
lands where a real shopper lands, and `unit_price` still reports an honest €/kg.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import httpx
from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.domains.products.ingest import (
    OP_PRICES,
    USER_AGENT,
    _canon_store,
    _eur,
    _pdate,
    is_plausible_price,
)
from app.domains.products.models import PricePoint, Product

logger = logging.getLogger(__name__)

# Synthetic barcode prefix. Deliberately not a digit string: nothing a scanner
# can emit collides with it, and a glance at a row says where it came from.
FRESH_PREFIX = "fl:"

# Purchase increments. 0.5 kg for anything bought by the handful, 0.25 kg for
# light or leafy things sold in small bags, 0.1 kg for aromatics used by the
# spoonful.
_HALF = Decimal("0.5")
_LIGHT = Decimal("0.25")
_AROMATIC = Decimal("0.1")


@dataclass(frozen=True)
class FreshItem:
    """A category we are willing to show, with its French name and pack size."""

    name: str
    pack_kg: Decimal


def _f(name: str, pack: Decimal = _HALF) -> FreshItem:
    return FreshItem(name=name, pack_kg=pack)


# Curated on purpose. Open Prices carries 398 French categories, many of them
# duplicates ("en:potatoes-from-france"), oddities ("en:pitayas") or typos
# ("en:heirloom-tomatoe"). Listing the ones French home cooking actually uses
# keeps the names right and stops junk reaching a shopping list.
FRESH_CATEGORIES: dict[str, FreshItem] = {
    # ── Légumes du quotidien ────────────────────────────────────────────────
    "en:potatoes": _f("Pommes de terre"),
    "en:new-potatoes": _f("Pommes de terre nouvelles"),
    "en:grenaille-potatoes": _f("Pommes de terre grenaille"),
    "en:charlotte-potatoes": _f("Pommes de terre Charlotte"),
    "en:carrots": _f("Carottes"),
    "en:onions": _f("Oignons"),
    "en:yellow-onions": _f("Oignons jaunes"),
    "en:red-onions": _f("Oignons rouges"),
    "en:white-onions": _f("Oignons blancs"),
    "en:shallots": _f("Échalotes", _AROMATIC),
    "en:garlic": _f("Ail", _AROMATIC),
    "en:leeks": _f("Poireaux"),
    "en:zucchini": _f("Courgettes"),
    "en:aubergines": _f("Aubergines"),
    "en:tomatoes": _f("Tomates"),
    "en:cherry-tomatoes": _f("Tomates cerises", _LIGHT),
    "en:red-bell-peppers": _f("Poivrons rouges"),
    "en:green-sweet-peppers": _f("Poivrons verts"),
    "en:yellow-sweet-peppers": _f("Poivrons jaunes"),
    "en:sweet-peppers": _f("Poivrons"),
    "en:mushrooms": _f("Champignons", _LIGHT),
    "en:champignon-mushrooms": _f("Champignons de Paris", _LIGHT),
    "en:oyster-mushrooms": _f("Pleurotes", _LIGHT),
    "en:broccoli": _f("Brocolis"),
    "en:cauliflower": _f("Chou-fleur"),
    "en:cabbages": _f("Chou"),
    "en:white-cabbage": _f("Chou blanc"),
    "en:red-cabbage": _f("Chou rouge"),
    "en:green-cabbage": _f("Chou vert"),
    "en:curly-kale": _f("Chou kale", _LIGHT),
    "en:brussels-sprouts": _f("Choux de Bruxelles"),
    "en:turnip": _f("Navets"),
    "en:beet": _f("Betteraves"),
    "en:uncooked-beetroots": _f("Betteraves crues"),
    "en:celery": _f("Céleri"),
    "en:celery-stalk": _f("Céleri branche"),
    "en:celeriac": _f("Céleri-rave"),
    "en:fennel-bulbs": _f("Fenouil"),
    "en:belgian-endives": _f("Endives"),
    "en:spinachs": _f("Épinards", _LIGHT),
    "en:lettuces": _f("Salade", _LIGHT),
    "en:corn-salad": _f("Mâche", _LIGHT),
    "en:rocket": _f("Roquette", _LIGHT),
    "en:green-beans": _f("Haricots verts"),
    "en:flat-beans": _f("Haricots plats"),
    "en:peas": _f("Petits pois"),
    "en:broad-beans": _f("Fèves"),
    "en:pumpkins": _f("Potiron"),
    "en:red-kuri-squash": _f("Potimarron"),
    "en:butternut-squash": _f("Courge butternut"),
    "en:spaghetti-squashes": _f("Courge spaghetti"),
    "en:sweet-potatoes": _f("Patates douces"),
    "en:jerusalem-artichoke": _f("Topinambours"),
    "en:artichokes": _f("Artichauts"),
    "en:asparagus": _f("Asperges", _LIGHT),
    "en:cucumbers": _f("Concombres"),
    "en:red-radishes": _f("Radis", _LIGHT),
    "en:avocados": _f("Avocats"),
    "en:ginger": _f("Gingembre", _AROMATIC),
    "en:turmeric": _f("Curcuma frais", _AROMATIC),
    "en:chili-peppers": _f("Piments", _AROMATIC),
    # ── Fruits ──────────────────────────────────────────────────────────────
    "en:apples": _f("Pommes"),
    "en:gala-apples": _f("Pommes Gala"),
    "en:golden-delicious-apples": _f("Pommes Golden"),
    "en:pink-lady": _f("Pommes Pink Lady"),
    "en:canada-reinettes-apples": _f("Pommes Reinette"),
    "en:pears": _f("Poires"),
    "en:williams-pears": _f("Poires Williams"),
    "en:bananas": _f("Bananes"),
    "en:oranges": _f("Oranges"),
    "en:clementines": _f("Clémentines"),
    "en:mandarins": _f("Mandarines"),
    "en:mandarin-oranges": _f("Mandarines"),
    "en:lemons": _f("Citrons"),
    "en:limes": _f("Citrons verts", _LIGHT),
    "en:grapefruits": _f("Pamplemousses"),
    "en:grapes": _f("Raisin"),
    "en:peaches": _f("Pêches"),
    "en:nectarines": _f("Nectarines"),
    "en:apricots": _f("Abricots"),
    "en:plums": _f("Prunes"),
    "en:cherries": _f("Cerises"),
    "en:strawberries": _f("Fraises", _LIGHT),
    "en:raspberries": _f("Framboises", _LIGHT),
    "en:blueberries": _f("Myrtilles", _LIGHT),
    "en:kiwis": _f("Kiwis"),
    "en:green-kiwis": _f("Kiwis verts"),
    "en:melons": _f("Melon"),
    "en:muskmelons": _f("Melon charentais"),
    "en:watermelons": _f("Pastèque"),
    "en:pineapple": _f("Ananas"),
    "en:mangoes": _f("Mangues"),
    "en:pomegranates": _f("Grenades"),
    "en:figs": _f("Figues", _LIGHT),
    "en:chestnuts": _f("Châtaignes", _LIGHT),
    # ── Fruits secs et légumes secs ─────────────────────────────────────────
    "en:walnuts": _f("Noix", _LIGHT),
    "en:hazelnuts": _f("Noisettes", _LIGHT),
    "en:almonds": _f("Amandes", _LIGHT),
    "en:cashew-nuts": _f("Noix de cajou", _LIGHT),
    "en:dates": _f("Dattes", _LIGHT),
    "en:chickpeas": _f("Pois chiches", _LIGHT),
    "en:green-lentils": _f("Lentilles vertes", _LIGHT),
}

# Categories arrive from a public feed; the crawl must not choke on a shape it
# has not seen. Anything failing these checks is skipped, never guessed at.
_MAX_PAGES = 110
_PAGE_SIZE = 100
_BATCH = 200


def loose_barcode(category_tag: str) -> str:
    """`en:potatoes` → `fl:potatoes`. Stable, so re-runs update rather than duplicate."""
    return FRESH_PREFIX + category_tag.split(":", 1)[-1]


def is_sold_loose(barcode: str | None) -> bool:
    """True for a weighed-produce entry rather than a barcoded pack."""
    return bool(barcode) and barcode.startswith(FRESH_PREFIX)  # type: ignore[union-attr]


def _pack_label(pack_kg: Decimal) -> str:
    """"0.5" → "500 g" — `parse_quantity` reads both, but people read grams."""
    if pack_kg >= 1:
        return f"{pack_kg.normalize()} kg".replace(".", ",")
    return f"{int(pack_kg * 1000)} g"


def _usable(item: dict[str, Any]) -> bool:
    """Whether one Open Prices row is a French per-kilo reading we can trust."""
    if item.get("product_code"):
        return False  # a packaged product: the barcode crawl already has it
    if item.get("price_per") != "KILOGRAM" or item.get("currency") != "EUR":
        return False
    if item.get("price_is_discounted"):
        # A promotional price is real but not representative; a basket costed on
        # last month's promotions would understate every week that follows.
        return False
    country = (item.get("location") or {}).get("osm_address_country") or ""
    if country not in ("France", "FR"):
        return False
    return item.get("category_tag") in FRESH_CATEGORIES


async def _fetch(client: httpx.AsyncClient, cutoff: datetime) -> list[dict[str, Any]]:
    """Every usable reading, newest first, stopping once past `cutoff`."""
    rows: list[dict[str, Any]] = []
    for page in range(1, _MAX_PAGES + 1):
        try:
            response = await client.get(
                OP_PRICES,
                params={
                    "product_code__isnull": "true",
                    "size": _PAGE_SIZE,
                    "page": page,
                    "order_by": "-date",
                },
                timeout=60,
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning(f"Fresh price page {page} skipped: {exc}")
            break

        items = payload.get("items") or []
        if not items:
            break
        for item in items:
            if _usable(item):
                rows.append(item)
        # Newest first, so once a whole page predates the cutoff there is
        # nothing older worth walking.
        if all(_pdate(i.get("date")) < cutoff for i in items):
            break
    return rows


async def refresh_fresh_prices(*, max_age_days: int = 240) -> dict[str, int]:
    """Ingest weighed-produce prices. Safe to run on a schedule.

    Mirrors `refresh_prices`: append-only price inserts, product rows updated in
    place, committed in small batches so readers never wait.
    """
    now = datetime.now(UTC).replace(microsecond=0)
    cutoff = now - timedelta(days=max_age_days)
    new_products = new_prices = 0

    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}) as client:
        rows = await _fetch(client, cutoff)

    by_code: dict[str, list[dict[str, Any]]] = {}
    for item in rows:
        observed = _pdate(item.get("date"))
        if observed < cutoff:
            continue
        store = _canon_store(item.get("location") or {})
        if not store:
            continue
        tag = item["category_tag"]
        spec = FRESH_CATEGORIES[tag]
        per_kg = item.get("price")
        if per_kg is None:
            continue
        try:
            pack_price = _eur(float(per_kg) * float(spec.pack_kg))
        except (ArithmeticError, ValueError, TypeError):
            continue
        if not is_plausible_price(float(pack_price)):
            continue
        by_code.setdefault(loose_barcode(tag), []).append(
            {
                "store": store,
                "price": pack_price,
                "city": (item.get("location") or {}).get("osm_address_city"),
                "observed": observed,
                "tag": tag,
            }
        )

    async with SessionLocal() as db:
        for index, (barcode, prices) in enumerate(by_code.items(), start=1):
            spec = FRESH_CATEGORIES[prices[0]["tag"]]
            product = await db.get(Product, barcode)
            if product is None:
                product = Product(barcode=barcode, fetched_at=now)
                db.add(product)
                new_products += 1
            product.name = spec.name
            product.quantity = _pack_label(spec.pack_kg)
            product.categories = prices[0]["tag"]
            product.fetched_at = now

            for price in prices:
                exists = await db.scalar(
                    select(func.count())
                    .select_from(PricePoint)
                    .where(
                        PricePoint.barcode == barcode,
                        PricePoint.store == price["store"],
                        PricePoint.price == price["price"],
                        func.date(PricePoint.created_at) == price["observed"].date(),
                    )
                )
                if exists:
                    continue
                db.add(
                    PricePoint(
                        barcode=barcode,
                        store=price["store"],
                        price=price["price"],
                        currency="EUR",
                        source="op",
                        location=price["city"],
                        created_at=price["observed"],
                    )
                )
                new_prices += 1

            if index % _BATCH == 0:
                await db.commit()
        await db.commit()

    return {
        "categories": len(by_code),
        "products_new": new_products,
        "prices_new": new_prices,
        "readings_seen": len(rows),
    }
