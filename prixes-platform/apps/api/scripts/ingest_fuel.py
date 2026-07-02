"""One-off fuel ingestion — pulls the official French gov fuel-price feed now.

Normally the ARQ worker runs this hourly (app/worker/main.py). This script lets
you populate fuel stations immediately for a baseline, without the worker running.

Run from apps/api (DB migrated, PostGIS enabled):
    python scripts/ingest_fuel.py
"""
from __future__ import annotations

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.http import close_http_client  # noqa: E402
from app.worker.tasks import ingest_fuel  # noqa: E402


async def main() -> None:
    print("Telechargement du flux carburants (donnees.roulez-eco.fr)...")
    result = await ingest_fuel({})
    print(f"OK {result['stations']} stations importees.")
    await close_http_client()


if __name__ == "__main__":
    asyncio.run(main())
