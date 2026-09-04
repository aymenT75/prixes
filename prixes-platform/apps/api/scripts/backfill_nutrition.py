"""Backfill the per-100g nutrition columns for products already in the catalog.

Two passes, cheapest first:

  1. From `raw_off` — the barcode lookup already stores the FULL OpenFoodFacts
     payload, nutriments included, so most of the catalog can be filled with
     zero network calls.
  2. From OpenFoodFacts (`--fetch`) — only for rows with no usable `raw_off`
     (worker-ingested rows, user-created products).

`--report` skips writing and just measures coverage, which is what tells you
whether nutrient-gap detection is viable on the current catalog.

Run from apps/api (DB migrated):
    python scripts/backfill_nutrition.py --report
    python scripts/backfill_nutrition.py                 # pass 1 only
    python scripts/backfill_nutrition.py --fetch         # pass 1 + pass 2
    python scripts/backfill_nutrition.py --fetch --limit 500
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import UTC, datetime  # noqa: E402

import httpx  # noqa: E402
from sqlalchemy import func, select  # noqa: E402

from app.core.db import SessionLocal  # noqa: E402
from app.domains.products.models import Product  # noqa: E402
from app.domains.products.off import NUTRIMENT_KEYS, extract_nutrition  # noqa: E402

OFF_PRODUCT = "https://world.openfoodfacts.org/api/v2/product/{}.json"
FIELDS = "nutriments,serving_size"
USER_AGENT = "Prixes/2.0 (nutrition-backfill)"

# The two the coach cannot work without: no fibre means no "pas assez de fibres",
# no fruit/veg share means no "pas assez de fruits".
CRITICAL = ("energy_kcal_100g", "proteins_100g", "sugars_100g", "fiber_100g",
            "fruits_vegetables_nuts_100g")


def _apply(product: Product, payload: dict) -> bool:
    """Set nutrition columns from an OFF payload. True if anything was declared."""
    values = extract_nutrition(payload)
    for column, value in values.items():
        setattr(product, column, value)
    serving = payload.get("serving_size") or None
    if serving and product.serving_size is None:
        product.serving_size = str(serving)[:64]
    return any(v is not None for v in values.values())


async def report() -> None:
    """Print per-nutrient coverage over the products that have a name."""
    columns = list(NUTRIMENT_KEYS)
    async with SessionLocal() as db:
        total = await db.scalar(
            select(func.count()).select_from(Product).where(Product.name.is_not(None))
        )
        if not total:
            print("Catalogue vide.")
            return
        counts = (
            await db.execute(
                select(*[
                    func.count(getattr(Product, c)).label(c) for c in columns
                ]).select_from(Product).where(Product.name.is_not(None))
            )
        ).one()
        checked = await db.scalar(
            select(func.count()).select_from(Product).where(
                Product.name.is_not(None), Product.nutrition_checked_at.is_not(None)
            )
        )
        with_raw = await db.scalar(
            select(func.count()).select_from(Product).where(
                Product.name.is_not(None), Product.raw_off.is_not(None)
            )
        )

    print(f"Produits nommes      : {total}")
    print(f"  dont raw_off       : {with_raw} ({with_raw / total:.0%})")
    print(f"  dont deja verifies : {checked} ({checked / total:.0%})")
    print("\nCouverture par nutriment :")
    for column, value in zip(columns, counts, strict=True):
        flag = "  <-- critique" if column in CRITICAL else ""
        print(f"  {column:<32} {value:>7} ({value / total:>4.0%}){flag}")


async def from_raw_off(limit: int | None) -> int:
    """Pass 1 — fill from the stored OFF payload. No network."""
    async with SessionLocal() as db:
        stmt = select(Product.barcode).where(
            Product.raw_off.is_not(None), Product.nutrition_checked_at.is_(None)
        )
        if limit:
            stmt = stmt.limit(limit)
        barcodes = list((await db.execute(stmt)).scalars())

    print(f"Passe 1 (raw_off) : {len(barcodes)} produits")
    filled = 0
    chunk = 200
    for i in range(0, len(barcodes), chunk):
        async with SessionLocal() as db:
            for barcode in barcodes[i : i + chunk]:
                product = await db.get(Product, barcode)
                if product is None or not isinstance(product.raw_off, dict):
                    continue
                if _apply(product, product.raw_off):
                    filled += 1
                product.nutrition_checked_at = datetime.now(UTC)
            await db.commit()
        print(f"  {min(i + chunk, len(barcodes))}/{len(barcodes)} (avec nutrition: {filled})")
    return filled


async def from_off(limit: int | None, concurrency: int) -> int:
    """Pass 2 — fetch the rows pass 1 couldn't fill."""
    async with SessionLocal() as db:
        stmt = select(Product.barcode).where(
            Product.name.is_not(None), Product.nutrition_checked_at.is_(None)
        )
        if limit:
            stmt = stmt.limit(limit)
        barcodes = list((await db.execute(stmt)).scalars())

    print(f"Passe 2 (OpenFoodFacts) : {len(barcodes)} produits")
    if not barcodes:
        return 0

    sem = asyncio.Semaphore(concurrency)
    filled = 0

    async def fetch(client: httpx.AsyncClient, barcode: str) -> tuple[str, dict | None]:
        async with sem:
            try:
                r = await client.get(
                    OFF_PRODUCT.format(barcode), params={"fields": FIELDS}, timeout=12.0
                )
                if r.status_code != 200:
                    return barcode, None
                data = r.json()
                if data.get("status") != 1:
                    return barcode, None
                return barcode, data.get("product") or {}
            except Exception:  # noqa: BLE001 — a miss must never abort the backfill
                return barcode, None

    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}) as client:
        chunk = 100
        for i in range(0, len(barcodes), chunk):
            batch = barcodes[i : i + chunk]
            results = await asyncio.gather(*(fetch(client, b) for b in batch))
            async with SessionLocal() as db:
                for barcode, payload in results:
                    product = await db.get(Product, barcode)
                    if product is None:
                        continue
                    if payload is not None and _apply(product, payload):
                        filled += 1
                    # Stamp either way: a barcode OFF doesn't know stays unknown,
                    # and re-asking on every page view would be pure latency.
                    product.nutrition_checked_at = datetime.now(UTC)
                await db.commit()
            print(f"  {min(i + chunk, len(barcodes))}/{len(barcodes)} (avec nutrition: {filled})")
    return filled


async def main(args: argparse.Namespace) -> None:
    if args.report:
        await report()
        return
    filled = await from_raw_off(args.limit)
    if args.fetch:
        filled += await from_off(args.limit, args.concurrency)
    print(f"\nOK Termine. {filled} produits enrichis.\n")
    await report()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Backfill product nutrition (per 100 g).")
    ap.add_argument("--report", action="store_true", help="measure coverage, write nothing")
    ap.add_argument(
        "--fetch", action="store_true", help="also query OFF for rows raw_off can't fill"
    )
    ap.add_argument("--limit", type=int, default=None, help="max products per pass")
    ap.add_argument("--concurrency", type=int, default=8, help="parallel OFF requests")
    asyncio.run(main(ap.parse_args()))
