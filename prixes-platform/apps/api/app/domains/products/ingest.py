"""Recurring REAL price refresh from Open Prices — driven by the ARQ worker.

This is the lightweight, importable counterpart to `scripts/scrape_prices.py`
(which is the one-off heavy seeder that also creates the demo user + deals). This
module ONLY refreshes prices + product metadata, so it is safe to run on a
schedule.

Latency-safety (the API never waits on this):
  * It runs in the *worker* container, not the API.
  * Price rows are append-only INSERTs — under Postgres MVCC, SELECT readers
    never block on inserts.
  * Product metadata UPDATEs are row-versioned; readers keep serving the previous
    committed row with no lock wait.
  * Work is committed in small batches so transactions (and any locks) stay short
    and fresh prices become visible incrementally.
"""
from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal

import httpx
from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.domains.products.models import PricePoint, Product

OP_PRICES = "https://prices.openfoodfacts.org/api/v1/prices"
OP_LOCATIONS = "https://prices.openfoodfacts.org/api/v1/locations"
OFF_PRODUCT = "https://world.openfoodfacts.org/api/v2/product/{}.json"
OFF_FIELDS = (
    "product_name,product_name_fr,brands,image_front_url,image_url,"
    "nutriscore_grade,nutrition_grades,ecoscore_grade,nova_group,categories,quantity"
)
USER_AGENT = "Prixes/2.0 (scheduled-price-refresh)"

# Map any OSM brand/name spelling to one of the retailers we surface.
RETAILER_MATCHERS: dict[str, tuple[str, ...]] = {
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
}
STORE_CANON = {
    "carrefour": "Carrefour", "carrefour market": "Carrefour", "carrefour city": "Carrefour",
    "carrefour express": "Carrefour", "carrefour contact": "Carrefour",
    "lidl": "Lidl", "aldi": "Aldi", "auchan": "Auchan", "auchan supermarché": "Auchan",
    "intermarché": "Intermarché", "intermarche": "Intermarché",
    "e.leclerc": "E.Leclerc", "leclerc": "E.Leclerc", "centre e.leclerc": "E.Leclerc",
    "super u": "Super U", "hyper u": "Super U", "u express": "Super U", "magasins u": "Super U",
    "monoprix": "Monoprix", "franprix": "Franprix", "casino": "Casino",
    "géant casino": "Casino", "lidl france": "Lidl", "netto": "Netto", "cora": "Cora",
}

_BATCH = 200  # commit every N products

# Plausibility bounds for an automatically-ingested grocery price. A supermarket
# item realistically costs between a few cents and a few hundred euros; anything
# outside this is almost certainly a data error (decimal/comma slip, wrong
# currency, a lot priced as a unit) and must never reach the comparison as if it
# were real. Data-quality risk #1 in the SIT audit.
_MIN_PRICE = Decimal("0.01")
_MAX_PRICE = Decimal("1000")


def _eur(value: float) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def is_plausible_price(value: float) -> bool:
    """True if `value` is a believable grocery price (see bounds above)."""
    try:
        price = _eur(value)
    except (ArithmeticError, ValueError, TypeError):
        return False
    return _MIN_PRICE <= price <= _MAX_PRICE


def _match_retailer(name: str | None) -> str | None:
    if not name:
        return None
    low = name.lower()
    for canon, needles in RETAILER_MATCHERS.items():
        if any(n in low for n in needles):
            return canon
    return None


def _canon_store(loc: dict) -> str | None:
    raw = (loc.get("osm_brand") or loc.get("osm_name") or "").strip()
    if not raw:
        return None
    return STORE_CANON.get(raw.lower(), raw[:120])


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


def _norm_embedded(p: dict) -> dict | None:
    """Normalise the product object Open Prices embeds in each price."""
    code = p.get("code")
    if not code:
        return None
    nova = p.get("nova_group")
    cats = p.get("categories_tags") or []
    label = None
    for c in cats:
        if c.startswith("en:") and " " in c[3:]:
            label = c[3:]
            break
    return {
        "barcode": str(code),
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


async def _enrich_from_off(client: httpx.AsyncClient, barcode: str) -> dict | None:
    try:
        r = await client.get(OFF_PRODUCT.format(barcode), params={"fields": OFF_FIELDS}, timeout=12.0)
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
            "nutriscore": (p.get("nutriscore_grade") or p.get("nutrition_grades") or "")[:1] or None,
            "ecoscore": (p.get("ecoscore_grade") or "")[:1] or None,
            "nova_group": int(nova) if isinstance(nova, (int, str)) and str(nova).isdigit() else None,
            "categories": p.get("categories"),
        }
    except Exception:  # noqa: BLE001
        return None


async def _find_retailer_locations(
    client: httpx.AsyncClient, per_retailer: int, max_pages: int = 12
) -> dict[str, list[dict]]:
    found: dict[str, list[dict]] = {r: [] for r in RETAILER_MATCHERS}
    for page in range(1, max_pages + 1):
        params = {"size": "100", "page": str(page), "order_by": "-price_count"}
        try:
            r = await client.get(OP_LOCATIONS, params=params, timeout=30.0)
            r.raise_for_status()
            items = r.json().get("items", [])
        except Exception:  # noqa: BLE001
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


async def _crawl(client: httpx.AsyncClient, per_retailer: int, prices_per_loc: int, pages: int) -> list[dict]:
    """Pull REAL prices per retailer's busiest French stores, plus recent FR prices."""
    out: list[dict] = []
    locs = await _find_retailer_locations(client, per_retailer)
    for retailer, stores in locs.items():
        for st in stores:
            params = {"location_id": str(st["id"]), "size": str(prices_per_loc), "order_by": "-date"}
            try:
                r = await client.get(OP_PRICES, params=params, timeout=30.0)
                r.raise_for_status()
                items = r.json().get("items", [])
            except Exception:  # noqa: BLE001
                continue
            for it in items:
                code, price = it.get("product_code"), it.get("price")
                if not (code and price) or not is_plausible_price(float(price)):
                    continue
                out.append({
                    "barcode": str(code), "store": retailer, "price": float(price),
                    "city": st.get("city"), "date": it.get("date"),
                    "product": _norm_embedded(it.get("product") or {}),
                })
    # Top up with recent France prices for product variety.
    for page in range(1, pages + 1):
        params = {"currency": "EUR", "order_by": "-created", "size": "50", "page": str(page)}
        try:
            r = await client.get(OP_PRICES, params=params, timeout=30.0)
            r.raise_for_status()
            items = r.json().get("items", [])
        except Exception:  # noqa: BLE001
            continue
        if not items:
            break
        for it in items:
            loc = it.get("location") or {}
            if loc.get("osm_address_country") != "France":
                continue
            code, price, store = it.get("product_code"), it.get("price"), _canon_store(loc)
            if not (code and price and store) or not is_plausible_price(float(price)):
                continue
            out.append({
                "barcode": str(code), "store": store, "price": float(price),
                "city": loc.get("osm_address_city"), "date": it.get("date"),
                "product": _norm_embedded(it.get("product") or {}),
            })
    return out


async def refresh_prices(
    *, per_retailer: int = 6, prices_per_loc: int = 40, pages: int = 6, enrich_cap: int = 30
) -> dict[str, int]:
    """Crawl real French prices and upsert them. Safe to run on a schedule."""
    now = datetime.now(UTC).replace(microsecond=0)
    new_products = new_prices = enriched = 0

    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}) as client:
        rows = await _crawl(client, per_retailer, prices_per_loc, pages)
        by_code: dict[str, list[dict]] = {}
        for r in rows:
            by_code.setdefault(r["barcode"], []).append(r)

        async with SessionLocal() as db:
            for i, (barcode, prices) in enumerate(by_code.items(), start=1):
                meta = next((p["product"] for p in prices if p["product"]), None) or {"barcode": barcode}
                product = await db.get(Product, barcode)
                if product is None:
                    product = Product(barcode=barcode, fetched_at=now)
                    db.add(product)
                    new_products += 1
                for k in ("name", "brand", "image_url", "quantity", "nutriscore",
                          "ecoscore", "nova_group", "categories"):
                    v = meta.get(k)
                    if v and not getattr(product, k, None):
                        setattr(product, k, v)
                if (not product.name or not product.image_url) and enriched < enrich_cap:
                    off = await _enrich_from_off(client, barcode)
                    enriched += 1
                    if off:
                        for k, v in off.items():
                            if v and not getattr(product, k, None):
                                setattr(product, k, v)
                product.fetched_at = now

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
                    new_prices += 1

                if i % _BATCH == 0:
                    await db.commit()
            await db.commit()

    return {
        "distinct_products": len(by_code),
        "products_new": new_products,
        "prices_new": new_prices,
        "enriched": enriched,
    }
