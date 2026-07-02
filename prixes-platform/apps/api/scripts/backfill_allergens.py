"""Backfill the `allergens` column for products already in the catalog.

The catalog predates the allergen feature, so existing rows have allergens=NULL.
This fetches each product's allergen tags from OpenFoodFacts and stores the FR
labels (or "" when none are declared, so we don't re-check forever).

Run from apps/api (DB migrated):
    python scripts/backfill_allergens.py            # all NULL rows
    python scripts/backfill_allergens.py --limit 500
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.domains.products.off import _extract_allergens  # noqa: E402
from app.core.db import SessionLocal  # noqa: E402
from app.domains.products.models import Product  # noqa: E402

OFF_PRODUCT = "https://world.openfoodfacts.org/api/v2/product/{}.json"
FIELDS = "allergens_tags"


async def fetch_allergens(client: httpx.AsyncClient, barcode: str) -> str:
    try:
        r = await client.get(OFF_PRODUCT.format(barcode), params={"fields": FIELDS}, timeout=12.0)
        if r.status_code != 200:
            return ""
        data = r.json()
        if data.get("status") != 1:
            return ""
        return _extract_allergens(data.get("product") or {}) or ""
    except Exception:  # noqa: BLE001
        return ""


async def main(limit: int | None, concurrency: int) -> None:
    async with SessionLocal() as db:
        stmt = select(Product.barcode).where(Product.allergens.is_(None))
        if limit:
            stmt = stmt.limit(limit)
        barcodes = list((await db.execute(stmt)).scalars())
    print(f"{len(barcodes)} produits a traiter")
    if not barcodes:
        return

    sem = asyncio.Semaphore(concurrency)
    done = 0
    with_allergens = 0
    async with httpx.AsyncClient(headers={"User-Agent": "Prixes/2.0 (allergen-backfill)"}) as client:
        async def work(bc: str) -> tuple[str, str]:
            async with sem:
                return bc, await fetch_allergens(client, bc)

        # Process in chunks so we commit progressively.
        chunk = 100
        for i in range(0, len(barcodes), chunk):
            batch = barcodes[i : i + chunk]
            results = await asyncio.gather(*(work(b) for b in batch))
            async with SessionLocal() as db:
                for bc, allergens in results:
                    p = await db.get(Product, bc)
                    if p is not None:
                        p.allergens = allergens
                        if allergens:
                            with_allergens += 1
                await db.commit()
            done += len(batch)
            print(f"  {done}/{len(barcodes)} (avec allergenes: {with_allergens})")

    print(f"OK Termine. {with_allergens} produits avec allergenes declares.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Backfill product allergens from OpenFoodFacts.")
    ap.add_argument("--limit", type=int, default=None, help="max products (default: all NULL)")
    ap.add_argument("--concurrency", type=int, default=8, help="parallel OFF requests")
    args = ap.parse_args()
    asyncio.run(main(args.limit, args.concurrency))
