"""REAL French supermarket price ingester (Open Prices, prices.openfoodfacts.org).

This replaces the old synthetic seeder. Every price written here is REAL data,
contributed from real French stores (Carrefour, Lidl, Auchan, Intermarche,
E.Leclerc, Super U, Monoprix, ...), with the real store name, real price, real
date and real product barcode. Product metadata (name, image, Nutri/Eco/NOVA) is
enriched from OpenFoodFacts.

Why Open Prices and not direct Lidl/Carrefour HTML scraping?
    The retailer sites are JS-rendered and aggressively bot-protected; scraping
    them directly is neither stable nor ToS-clean. Open Prices is the open,
    community-sourced price database for exactly these French stores (proofs are
    photos of shelf labels / receipts from those retailers) and it exposes a real
    REST API that updates continuously. That is the honest "real, updating" source.

Run (from apps/api, DB migrated):
    python scripts/scrape_prices.py                 # ~600 recent real FR prices
    python scripts/scrape_prices.py --pages 12      # crawl deeper
    python scripts/scrape_prices.py --enrich 250    # OFF lookups for missing names

Idempotent: products upsert by barcode; a price is only inserted once per
(barcode, store, date, price) so re-runs add new prices without duplicating.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func, select  # noqa: E402

from app.core.db import SessionLocal  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.domains.products.models import PricePoint, Product  # noqa: E402
from app.domains.users.models import User  # noqa: E402

OP_PRICES = "https://prices.openfoodfacts.org/api/v1/prices"
OP_LOCATIONS = "https://prices.openfoodfacts.org/api/v1/locations"
OFF_PRODUCT = "https://world.openfoodfacts.org/api/v2/product/{}.json"

# Map any OSM brand/name spelling to one of the supermarkets we surface.
RETAILER_MATCHERS = {
    "Lidl": ("lidl",),
    "Aldi": ("aldi",),
    "Carrefour": ("carrefour",),
    "E.Leclerc": ("leclerc",),
    "Intermarché": ("intermarch", "netto"),
    "Auchan": ("auchan",),
    "Super U": ("super u", "hyper u", "u express", "magasins u", "système u", "systeme u"),
    "Monoprix": ("monoprix",),
    "Franprix": ("franprix",),
    "Casino": ("casino",),
    "Cora": ("cora",),
    "Grand Frais": ("grand frais", "grandfrais"),
    "H Market": ("h market", "h-market", "hmarket"),
}


def _match_retailer(name: str | None) -> str | None:
    if not name:
        return None
    low = name.lower()
    for canon, needles in RETAILER_MATCHERS.items():
        if any(n in low for n in needles):
            return canon
    return None
OFF_FIELDS = (
    "product_name,product_name_fr,brands,image_front_url,image_url,"
    "nutriscore_grade,nutrition_grades,ecoscore_grade,nova_group,categories,quantity"
)

DEMO_EMAIL = "demo@prixes.app"
DEMO_PASSWORD = "demo1234"  # noqa: S105 — local dev/demo account, documented in DEPLOY.md

# Canonicalise common French retailer brand spellings from OSM tags.
STORE_CANON = {
    "carrefour": "Carrefour", "carrefour market": "Carrefour", "carrefour city": "Carrefour",
    "carrefour express": "Carrefour", "carrefour contact": "Carrefour",
    "lidl": "Lidl", "aldi": "Aldi",
    "auchan": "Auchan", "auchan supermarché": "Auchan", "auchan piéton": "Auchan",
    "intermarché": "Intermarché", "intermarche": "Intermarché",
    "intermarché super": "Intermarché", "intermarché contact": "Intermarché",
    "e.leclerc": "E.Leclerc", "leclerc": "E.Leclerc", "centre e.leclerc": "E.Leclerc",
    "super u": "Super U", "hyper u": "Super U", "u express": "Super U", "magasins u": "Super U",
    "monoprix": "Monoprix", "franprix": "Franprix", "casino": "Casino",
    "géant casino": "Casino", "lidl france": "Lidl", "netto": "Netto", "cora": "Cora",
    "grand frais": "Grand Frais", "grandfrais": "Grand Frais",
    "h market": "H Market", "h-market": "H Market", "hmarket": "H Market",
}


def _eur(value: float) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _canon_store(loc: dict) -> str | None:
    raw = (loc.get("osm_brand") or loc.get("osm_name") or "").strip()
    if not raw:
        return None
    return STORE_CANON.get(raw.lower(), raw[:120])


def _norm_embedded(p: dict) -> dict | None:
    """Normalise the product object Open Prices embeds in each price."""
    code = p.get("code")
    if not code:
        return None
    nova = p.get("nova_group")
    cats = p.get("categories_tags") or []
    # Prefer a human FR category label if present.
    label = None
    for c in cats:
        if c.startswith("en:") and " " in c[3:]:
            label = c[3:]
            break
    return {
        "barcode": code,
        "name": p.get("product_name") or None,
        "brand": (p.get("brands") or "").split(",")[0].strip() or None,
        "image_url": p.get("image_url") or None,
        "quantity": (str(p.get("product_quantity")) + (p.get("product_quantity_unit") or ""))
        if p.get("product_quantity") else (p.get("quantity") or None),
        "nutriscore": (p.get("nutriscore_grade") or "")[:1] or None,
        "ecoscore": (p.get("ecoscore_grade") or "")[:1] or None,
        "nova_group": int(nova) if isinstance(nova, int) else None,
        "categories": label or (cats[0][3:] if cats else None),
    }


async def find_retailer_locations(
    client: httpx.AsyncClient, per_retailer: int, max_pages: int = 12
) -> dict[str, list[dict]]:
    """Page busiest Open Prices locations, group France stores by retailer brand."""
    found: dict[str, list[dict]] = {r: [] for r in RETAILER_MATCHERS}
    for page in range(1, max_pages + 1):
        params = {"size": "100", "page": str(page), "order_by": "-price_count"}
        try:
            r = await client.get(OP_LOCATIONS, params=params, timeout=30.0)
            r.raise_for_status()
            items = r.json().get("items", [])
        except Exception as exc:  # noqa: BLE001
            print(f"  ! locations page {page} failed: {exc}")
            continue
        if not items:
            break
        for loc in items:
            if loc.get("osm_address_country") != "France":
                continue
            canon = _match_retailer(loc.get("osm_brand") or loc.get("osm_name"))
            if canon and len(found[canon]) < per_retailer:
                found[canon].append({"id": loc.get("id"), "city": loc.get("osm_address_city")})
        if all(len(v) >= per_retailer for v in found.values()):
            break
    return {k: v for k, v in found.items() if v}


async def crawl_by_location(
    client: httpx.AsyncClient, per_retailer: int, prices_per_loc: int
) -> list[dict]:
    """Pull REAL prices for each retailer's busiest French stores."""
    locs = await find_retailer_locations(client, per_retailer)
    out: list[dict] = []
    for retailer, stores in locs.items():
        kept = 0
        for st in stores:
            params = {"location_id": str(st["id"]), "size": str(prices_per_loc),
                      "order_by": "-date"}
            try:
                r = await client.get(OP_PRICES, params=params, timeout=30.0)
                r.raise_for_status()
                items = r.json().get("items", [])
            except Exception as exc:  # noqa: BLE001
                print(f"  ! prices for {retailer} loc {st['id']} failed: {exc}")
                continue
            for it in items:
                code = it.get("product_code")
                price = it.get("price")
                if not (code and price):
                    continue
                out.append({
                    "barcode": str(code),
                    "store": retailer,
                    "price": float(price),
                    "city": st.get("city") or (it.get("location") or {}).get("osm_address_city"),
                    "date": it.get("date"),
                    "product": _norm_embedded(it.get("product") or {}),
                })
                kept += 1
        print(f"  {retailer:<12} {len(stores)} magasins -> {kept} prix reels")
    return out


async def crawl_open_prices(client: httpx.AsyncClient, pages: int) -> list[dict]:
    """Page through recent EUR prices, keep France items with a barcode."""
    out: list[dict] = []
    for page in range(1, pages + 1):
        params = {"currency": "EUR", "order_by": "-created", "size": "50", "page": str(page)}
        try:
            r = await client.get(OP_PRICES, params=params, timeout=30.0)
            r.raise_for_status()
            items = r.json().get("items", [])
        except Exception as exc:  # noqa: BLE001
            print(f"  ! Open Prices page {page} failed: {exc}")
            continue
        if not items:
            break
        kept = 0
        for it in items:
            loc = it.get("location") or {}
            if loc.get("osm_address_country") != "France":
                continue
            code = it.get("product_code")
            price = it.get("price")
            store = _canon_store(loc)
            if not (code and price and store):
                continue
            out.append({
                "barcode": str(code),
                "store": store,
                "price": float(price),
                "city": loc.get("osm_address_city"),
                "date": it.get("date"),
                "product": _norm_embedded(it.get("product") or {}),
            })
            kept += 1
        print(f"  page {page:>2}: {kept} prix FR reels")
    return out


async def enrich_from_off(client: httpx.AsyncClient, barcode: str) -> dict | None:
    try:
        r = await client.get(
            OFF_PRODUCT.format(barcode), params={"fields": OFF_FIELDS}, timeout=15.0
        )
        if r.status_code != 200:
            return None
        data = r.json()
        if data.get("status") != 1:
            return None
        p = data["product"]
        nova = p.get("nova_group")
        return {
            "name": p.get("product_name_fr") or p.get("product_name"),
            "brand": (p.get("brands") or "").split(",")[0].strip() or None,
            "image_url": p.get("image_front_url") or p.get("image_url"),
            "quantity": p.get("quantity"),
            "nutriscore": (p.get("nutriscore_grade") or p.get("nutrition_grades") or "")[:1]
            or None,
            "ecoscore": (p.get("ecoscore_grade") or "")[:1] or None,
            "nova_group": int(nova)
            if isinstance(nova, (int, str)) and str(nova).isdigit()
            else None,
            "categories": p.get("categories"),
        }
    except Exception:  # noqa: BLE001
        return None


def _pdate(s: str | None) -> datetime:
    if not s:
        return datetime.now(UTC)
    try:
        return datetime.fromisoformat(s).replace(tzinfo=UTC)
    except ValueError:
        try:
            return datetime.combine(date.fromisoformat(s), datetime.min.time(), tzinfo=UTC)
        except ValueError:
            return datetime.now(UTC)


async def main(pages: int, enrich_cap: int,
               per_retailer: int, prices_per_loc: int) -> None:
    now = datetime.now(UTC).replace(microsecond=0)
    headers = {"User-Agent": "Prixes/2.0 (real-price-ingest)"}
    async with httpx.AsyncClient(headers=headers) as client:
        print("Recuperation des prix reels par enseigne (Open Prices, France)...")
        rows = await crawl_by_location(client, per_retailer, prices_per_loc)
        # Top up with recent FR prices for extra product variety.
        rows += await crawl_open_prices(client, pages)
        print(f"  -> {len(rows)} prix reels recuperes")

        # Group by barcode
        by_code: dict[str, list[dict]] = {}
        for r in rows:
            by_code.setdefault(r["barcode"], []).append(r)
        print(f"  -> {len(by_code)} produits distincts")

        async with SessionLocal() as db:
            # demo user
            demo = (
                await db.execute(select(User).where(User.email == DEMO_EMAIL))
            ).scalar_one_or_none()
            if demo is None:
                demo = User(
                    email=DEMO_EMAIL, username="Demo Prixes", initials="DP",
                    password_hash=hash_password(DEMO_PASSWORD), reputation=1240,
                    is_verified=True, role="admin",
                )
                db.add(demo)
                await db.flush()
                print(f"+ demo user {DEMO_EMAIL} / {DEMO_PASSWORD}")
            else:
                print(f"= demo user existe ({DEMO_EMAIL})")

            enriched = 0
            seeded: list[Product] = []
            for barcode, prices in by_code.items():
                meta = next((p["product"] for p in prices if p["product"]), None) or {
                    "barcode": barcode
                }
                product = await db.get(Product, barcode)
                if product is None:
                    product = Product(barcode=barcode, fetched_at=now)
                    db.add(product)
                # Apply embedded metadata
                for k in ("name", "brand", "image_url", "quantity", "nutriscore", "ecoscore",
                          "nova_group", "categories"):
                    v = meta.get(k)
                    if v and not getattr(product, k, None):
                        setattr(product, k, v)
                # Enrich missing name/image from OFF (capped)
                if (not product.name or not product.image_url) and enriched < enrich_cap:
                    off = await enrich_from_off(client, barcode)
                    enriched += 1
                    if off:
                        for k, v in off.items():
                            if v and not getattr(product, k, None):
                                setattr(product, k, v)
                product.fetched_at = now
                await db.flush()
                seeded.append(product)

                # Insert real price points (dedup by barcode+store+date+price)
                for p in prices:
                    pdt = _pdate(p["date"])
                    exists = await db.scalar(
                        select(func.count()).select_from(PricePoint).where(
                            PricePoint.barcode == barcode,
                            PricePoint.store == p["store"],
                            PricePoint.price == _eur(p["price"]),
                            func.date(PricePoint.created_at) == pdt.date(),
                        )
                    )
                    if exists:
                        continue
                    db.add(PricePoint(
                        barcode=barcode, store=p["store"], price=_eur(p["price"]),
                        currency="EUR", source="op", location=p.get("city"), created_at=pdt,
                    ))
            await db.flush()
            total_prices = await db.scalar(select(func.count()).select_from(PricePoint))
            print(f"  -> {len(seeded)} produits, {total_prices} prix reels en base "
                  f"({enriched} enrichis via OFF)")

            await db.commit()

    print("\nOK Donnees reelles ingerees. Login: demo@prixes.app / demo1234")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Ingest REAL French prices from Open Prices.")
    ap.add_argument("--pages", type=int, default=6, help="extra recent-prices pages (50/page)")
    ap.add_argument("--per-retailer", type=int, default=6, help="stores crawled per retailer")
    ap.add_argument("--prices-per-loc", type=int, default=40, help="prices pulled per store")
    ap.add_argument("--enrich", type=int, default=200, help="max OFF lookups for missing metadata")
    args = ap.parse_args()
    asyncio.run(main(args.pages, args.enrich, args.per_retailer, args.prices_per_loc))
