"""Backfill the `diets` column for products already in the catalog.

Fetches OFF labels + ingredient-analysis tags and stores the FR diet labels the
product satisfies (vegan, vegetarian, gluten-free, organic, halal, kosher,
lactose-free), or "" when none — so we don't re-check forever.

Run from apps/api (DB migrated):
    python scripts/backfill_diets.py
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.core.db import SessionLocal  # noqa: E402
from app.domains.products.models import Product  # noqa: E402
from app.domains.products.off import _extract_diets  # noqa: E402

OFF_PRODUCT = "https://world.openfoodfacts.org/api/v2/product/{}.json"
FIELDS = "labels_tags,ingredients_analysis_tags"


async def fetch_diets(client: httpx.AsyncClient, barcode: str) -> str:
    try:
        r = await client.get(OFF_PRODUCT.format(barcode), params={"fields": FIELDS}, timeout=12.0)
        if r.status_code != 200:
            return ""
        data = r.json()
        if data.get("status") != 1:
            return ""
        return _extract_diets(data.get("product") or {}) or ""
    except Exception:  # noqa: BLE001
        return ""


async def main(limit: int | None, concurrency: int) -> None:
    async with SessionLocal() as db:
        stmt = select(Product.barcode).where(Product.diets.is_(None))
        if limit:
            stmt = stmt.limit(limit)
        barcodes = list((await db.execute(stmt)).scalars())
    print(f"{len(barcodes)} produits a traiter")
    if not barcodes:
        return

    sem = asyncio.Semaphore(concurrency)
    done = with_diet = 0
    async with httpx.AsyncClient(headers={"User-Agent": "Prixes/2.0 (diet-backfill)"}) as client:
        async def work(bc: str) -> tuple[str, str]:
            async with sem:
                return bc, await fetch_diets(client, bc)

        chunk = 100
        for i in range(0, len(barcodes), chunk):
            batch = barcodes[i : i + chunk]
            results = await asyncio.gather(*(work(b) for b in batch))
            async with SessionLocal() as db:
                for bc, diets in results:
                    p = await db.get(Product, bc)
                    if p is not None:
                        p.diets = diets
                        if diets:
                            with_diet += 1
                await db.commit()
            done += len(batch)
            print(f"  {done}/{len(barcodes)} (avec regime: {with_diet})")

    print(f"OK Termine. {with_diet} produits avec regime declare.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Backfill product diets from OpenFoodFacts.")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--concurrency", type=int, default=8)
    args = ap.parse_args()
    asyncio.run(main(args.limit, args.concurrency))
