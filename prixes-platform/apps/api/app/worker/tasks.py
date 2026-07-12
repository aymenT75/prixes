"""Background tasks: refresh trending feed, evaluate price alerts."""
from __future__ import annotations

from typing import Any

from app.core.db import SessionLocal
# Import the full model registry so SQLAlchemy can resolve every ForeignKey
# (e.g. price_alerts -> users/products) when it sorts tables on commit. The
# worker process would otherwise only load a subset of mappers.
from app.core import models as _models  # noqa: F401
from app.domains.alerts import service as alert_service
from app.domains.notifications import service as notify_service
from app.domains.products.ingest import refresh_prices as _refresh_prices


async def evaluate_price_alerts(_: dict[str, Any]) -> dict[str, int]:
    """Check every active price alert against the latest prices, flag matches, and
    push a notification to the owner's devices (in addition to the in-app flag)."""
    async with SessionLocal() as db:
        triggered = await alert_service.evaluate_all(db)
        await db.commit()
        pushed = await notify_service.notify_price_drops(db, triggered) if triggered else 0
        await db.commit()
    return {"triggered": len(triggered), "pushed": pushed}


async def refresh_prices(_: dict[str, Any]) -> dict[str, int]:
    """Scheduled real-price refresh (Open Prices). Runs in the worker so the
    public API never sees the crawl latency (see products/ingest.py)."""
    return await _refresh_prices()
