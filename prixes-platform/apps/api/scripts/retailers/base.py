"""Extension point for REAL retailer price scrapers.

The baseline seeder synthesises store prices around an OpenFoodFacts catalog so
the app works offline-of-retailers. To plug in live Lidl / Carrefour / Auchan
prices, implement `RetailerScraper.fetch` and append the yielded rows as
PricePoint(source="<retailer>") in scripts/seed.py.

Design notes for whoever wires these up:
- Lidl/Aldi/Carrefour are JS-rendered + bot-protected → use Playwright (headless)
  or their internal JSON endpoints (inspect XHR), never naive requests.
- Respect robots.txt and rate limits; cache aggressively; run in the ARQ worker
  on a slow cron (e.g. nightly), not on the request path.
- Match products by EAN barcode where possible so prices join the OFF catalog.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass
from decimal import Decimal


@dataclass(slots=True)
class ScrapedPrice:
    barcode: str | None
    name: str
    store: str
    price: Decimal
    currency: str = "EUR"
    location: str | None = None


class RetailerScraper(ABC):
    """Implement one per retailer; `store` is persisted as PricePoint.store."""

    store: str

    @abstractmethod
    async def fetch(self, query: str, limit: int = 20) -> AsyncIterator[ScrapedPrice]:
        """Yield real prices for `query` from this retailer."""
        raise NotImplementedError
