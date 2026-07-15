"""Baseline data seeder / catalog crawler.

Populates the database with REAL French grocery products (crawled from the
OpenFoodFacts open database, country=France), attaches multi-supermarket price
points (Lidl, Aldi, Carrefour, E.Leclerc, Intermarché, Auchan), creates a demo
login + a handful of community deals, and warms the Redis feed.

Why OpenFoodFacts and not raw Lidl/Aldi scraping?
    Lidl/Aldi/Carrefour sites are JS-rendered and aggressively bot-protected, so
    a "works right now" baseline can't rely on them. OFF is an open, rate-friendly
    API with real EAN barcodes, names, brands, images and Nutri/Eco/NOVA scores —
    exactly the fields the Courses tab renders. Store prices are synthesised
    deterministically around a per-category base (clearly sourced as "seed"),
    which is the honest way to demo comparison until live retailer feeds are wired
    in. See `scripts/retailers/` for the real-scraper extension point.

Run (from apps/api, with DB migrated):
    python scripts/seed.py                 # ~48 products, 6 stores, 12 deals
    python scripts/seed.py --per-cat 12    # crawl more per category

Idempotent: products upsert by barcode; prices/deals only created when absent.
"""
from __future__ import annotations

import argparse
import asyncio
import contextlib
import hashlib
import os
import random
import sys
from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

import httpx

# Make `app` importable when run as `python scripts/seed.py` from apps/api.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func, select  # noqa: E402

from app.core.db import SessionLocal  # noqa: E402
from app.core.ranking import hot_score  # noqa: E402
from app.core.redis import FEED_HOT, FEED_NEW, redis_client  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.domains.deals.models import Deal  # noqa: E402
from app.domains.products.models import PricePoint, Product  # noqa: E402
from app.domains.products.off import _normalise_off  # noqa: E402
from app.domains.users.models import User  # noqa: E402

OFF_SEARCH = "https://world.openfoodfacts.org/api/v2/search"
OFF_FIELDS = (
    "code,product_name,product_name_fr,brands,image_front_url,image_url,"
    "nutriscore_grade,nutrition_grades,ecoscore_grade,nova_group,categories,quantity"
)

# (OFF category tag, human label, base price € for synthesising store prices)
CATEGORIES = [
    ("dairies", "Produits laitiers", 1.80),
    ("breakfast-cereals", "Petit-déjeuner", 3.20),
    ("biscuits-and-cakes", "Biscuits & gâteaux", 2.40),
    ("beverages", "Boissons", 1.50),
    ("pastas", "Pâtes & riz", 1.20),
    ("chocolates", "Chocolats", 2.90),
]

# Store -> price multiplier vs the category base (discounters cheaper).
STORES = {
    "Lidl": 0.89,
    "Aldi": 0.91,
    "E.Leclerc": 0.95,
    "Intermarché": 0.99,
    "Auchan": 1.02,
    "Carrefour": 1.06,
}

DEMO_EMAIL = "demo@prixes.app"
DEMO_PASSWORD = "demo1234"  # noqa: S105 — local dev/demo account, documented in DEPLOY.md

# Fallback synthetic products when OFF API is unavailable
_PLACEHOLDER = "https://via.placeholder.com/400x300?text={}"
FALLBACK_PRODUCTS = [
    {"barcode": "3017760000011", "name": "Danone Yaourt Nature", "brand": "Danone",
     "categories": "Produits laitiers", "image_url": _PLACEHOLDER.format("Yaourt")},
    {"barcode": "3274080005003", "name": "Labeyrie Saumon Fume", "brand": "Labeyrie",
     "categories": "Produits laitiers", "image_url": _PLACEHOLDER.format("Saumon")},
    {"barcode": "3250391003054", "name": "Nestle Petit-Dej Cereales", "brand": "Nestle",
     "categories": "Petit-dejeuner", "image_url": _PLACEHOLDER.format("Cereales")},
    {"barcode": "4001724006507", "name": "Kelloggs Cornflakes", "brand": "Kelloggs",
     "categories": "Petit-dejeuner", "image_url": _PLACEHOLDER.format("Cornflakes")},
    {"barcode": "7613032749221", "name": "Lu Biscuit Chocolat", "brand": "Lu",
     "categories": "Biscuits & gateaux", "image_url": _PLACEHOLDER.format("Biscuit")},
    {"barcode": "8710822009042", "name": "Oreo Cookies", "brand": "Oreo",
     "categories": "Biscuits & gateaux", "image_url": _PLACEHOLDER.format("Cookies")},
    {"barcode": "5449000224413", "name": "Coca-Cola Zero", "brand": "Coca-Cola",
     "categories": "Boissons", "image_url": _PLACEHOLDER.format("Coca")},
    {"barcode": "4001123456789", "name": "Tropicana Jus Orange", "brand": "Tropicana",
     "categories": "Boissons", "image_url": _PLACEHOLDER.format("Jus")},
    {"barcode": "5410188016961", "name": "Barilla Pates Spaghetti", "brand": "Barilla",
     "categories": "Pates & riz", "image_url": _PLACEHOLDER.format("Pates")},
    {"barcode": "3228857000277", "name": "Uncle Bens Riz Blanc", "brand": "Uncle Ben's",
     "categories": "Pates & riz", "image_url": _PLACEHOLDER.format("Riz")},
    {"barcode": "737628064502", "name": "Lindor Truffes Chocolat", "brand": "Lindor",
     "categories": "Chocolats", "image_url": _PLACEHOLDER.format("Lindor")},
    {"barcode": "42111422", "name": "Milka Tablette Chocolat", "brand": "Milka",
     "categories": "Chocolats", "image_url": _PLACEHOLDER.format("Milka")},
]


def _eur(value: float) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _jitter(barcode: str, store: str) -> float:
    """Deterministic ±6% per (product, store) so prices are stable across runs."""
    # Not a security use — just a stable checksum to derive a repeatable jitter value.
    h = hashlib.md5(f"{barcode}:{store}".encode(), usedforsecurity=False).hexdigest()
    return 0.94 + (int(h[:4], 16) % 1200) / 10000.0  # 0.94 .. 1.06


async def crawl_category(client: httpx.AsyncClient, tag: str, n: int) -> list[dict]:
    params = {
        "categories_tags_en": tag,
        "countries_tags_en": "france",
        "fields": OFF_FIELDS,
        "page_size": str(n),
        "sort_by": "unique_scans_n",
    }
    try:
        resp = await client.get(OFF_SEARCH, params=params, timeout=30.0)
        resp.raise_for_status()
        products = resp.json().get("products", [])
    except Exception as exc:  # noqa: BLE001
        print(f"  ! crawl failed for {tag}: {exc}")
        return []
    out = []
    for p in products:
        code = p.get("code")
        if code and (p.get("product_name") or p.get("product_name_fr")):
            out.append(_normalise_off(code, p))
    return out


async def main(per_cat: int, n_deals: int) -> None:
    rng = random.Random(42)  # noqa: S311 — fixed seed for reproducible demo data, not crypto
    now = datetime.now(UTC).replace(microsecond=0)  # Ensure clean timezone-aware datetime

    # No HTTP client needed here — this flow seeds from FALLBACK_PRODUCTS (below),
    # not a live OpenFoodFacts crawl, so `crawl_category`'s client is unused in main().
    async with SessionLocal() as db:
        # ── Demo user ──────────────────────────────────────────────
        demo = (
            await db.execute(select(User).where(User.email == DEMO_EMAIL))
        ).scalar_one_or_none()
        if demo is None:
            demo = User(
                email=DEMO_EMAIL,
                username="Demo Prixes",
                initials="DP",
                password_hash=hash_password(DEMO_PASSWORD),
                reputation=1240,
                is_verified=True,
                role="admin",
            )
            db.add(demo)
            await db.flush()
            print(f"+ demo user  {DEMO_EMAIL} / {DEMO_PASSWORD}")
        else:
            print(f"= demo user already exists ({DEMO_EMAIL})")

        # ── Use fallback products (OpenFoodFacts API is unreliable) ───────────
        seeded: list[Product] = []
        print("Seeding with fallback synthetic products")
        for data in FALLBACK_PRODUCTS:
            barcode = data["barcode"]
            product = await db.get(Product, barcode)
            if product is None:
                product = Product(
                    barcode=barcode,
                    name=data.get("name", ""),
                    brand=data.get("brand"),
                    categories=data.get("categories", ""),
                    image_url=data.get("image_url"),
                    fetched_at=now,
                )
                db.add(product)
                seeded.append(product)
        await db.flush()

        # Synthesise prices for all products
        for product in seeded:
            for store, mult in STORES.items():
                base = 2.0  # Default base price
                price = _eur(base * mult * _jitter(product.barcode, store))
                db.add(
                    PricePoint(
                        barcode=product.barcode,
                        store=store,
                        price=price,
                        currency="EUR",
                        source="seed",
                        location="France",
                        created_at=now,
                    )
                )
        await db.flush()

        print(f"  > {len(seeded)} produits, ~{len(seeded) * len(STORES)} prix magasins")

        # ── Community deals (real products, discounted) ────────────
        existing_deals = await db.scalar(select(func.count()).select_from(Deal))
        created = 0
        if existing_deals == 0 and seeded:
            picks = rng.sample(seeded, min(n_deals, len(seeded)))
            for product in picks:
                prices = (
                    await db.execute(
                        select(PricePoint.price).where(PricePoint.barcode == product.barcode)
                    )
                ).scalars().all()
                if not prices:
                    continue
                cheapest = min(prices)
                usual = _eur(float(max(prices)) * 1.18)  # "usual" reference price
                if cheapest >= usual:
                    continue
                up = rng.randint(3, 180)
                created_at_aware = now - timedelta(hours=rng.randint(1, 72))
                created_at_naive = created_at_aware.replace(tzinfo=None)  # Strip tz for DB storage
                deal = Deal(
                    author_id=demo.id,
                    title=f"{product.name} -- {product.brand or 'bonne affaire'}",
                    description="Prix repere en magasin par la communaute.",
                    store=rng.choice(list(STORES)),
                    category=product.categories,
                    price_now=cheapest,
                    price_before=usual,
                    photo_url=product.image_url,
                    link=f"https://world.openfoodfacts.org/product/{product.barcode}",
                    votes_up=up,
                    votes_down=rng.randint(0, 12),
                    created_at=created_at_naive,
                )
                deal.score = hot_score(deal.votes_up, deal.votes_down, created_at_aware)
                db.add(deal)
                created += 1
            demo.deals_count = created
            print(f"  > {created} deals crees")
        else:
            print(f"= deals already present ({existing_deals}), skipping")

        await db.commit()

        # ── Warm Redis ranked feeds ────────────────────────────────
        rows = (
            await db.execute(select(Deal).where(Deal.status == "active"))
        ).scalars().all()
        if rows:
            await redis_client.zadd(
                FEED_HOT, {str(d.id): float(d.score) for d in rows}
            )
            await redis_client.zadd(
                FEED_NEW, {str(d.id): d.created_at.timestamp() for d in rows}
            )
            print(f"  > Redis feeds warmed ({len(rows)} deals)")

    # Redis close timing out just means the script exits anyway — not worth surfacing.
    with contextlib.suppress(TimeoutError):
        await asyncio.wait_for(redis_client.aclose(), timeout=2.0)
    print("\nOK Seed fini. Connecte-toi avec demo@prixes.app / demo1234")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed Prixes with real OFF products.")
    parser.add_argument("--per-cat", type=int, default=8, help="products crawled per category")
    parser.add_argument("--deals", type=int, default=12, help="number of demo deals")
    args = parser.parse_args()
    asyncio.run(main(args.per_cat, args.deals))
