"""One-off ingestion of weighed produce (fruits et légumes vendus au poids).

The worker runs this daily on its own; this script exists so a fresh deployment
does not have to wait for the first cron tick.

    docker compose exec api python scripts/ingest_fresh.py
"""
from __future__ import annotations

import asyncio
import os
import sys

# Run as `python scripts/ingest_fresh.py` from the api root, like its siblings.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import every model first, so SQLAlchemy can resolve the foreign keys.
from app.core import models as _models  # noqa: E402,F401
from app.domains.products.fresh import FRESH_CATEGORIES, refresh_fresh_prices  # noqa: E402


async def main() -> int:
    print(f"Catégories suivies : {len(FRESH_CATEGORIES)}")
    stats = await refresh_fresh_prices()
    print(
        f"Relevés lus            : {stats['readings_seen']}\n"
        f"Catégories trouvées    : {stats['categories']}\n"
        f"Produits créés         : {stats['products_new']}\n"
        f"Prix ajoutés           : {stats['prices_new']}"
    )
    return 0 if stats["categories"] else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
