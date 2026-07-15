"""Background tasks: refresh trending feed, evaluate price alerts."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import CursorResult, delete

# Import the full model registry so SQLAlchemy can resolve every ForeignKey
# (e.g. price_alerts -> users/products) when it sorts tables on commit. The
# worker process would otherwise only load a subset of mappers.
from app.core import models as _models  # noqa: F401
from app.core.db import SessionLocal
from app.domains.alerts import service as alert_service
from app.domains.analytics.models import AnalyticsEvent
from app.domains.notifications import service as notify_service
from app.domains.products.ingest import refresh_prices as _refresh_prices

# GDPR data minimisation: anonymous usage events have no purpose past this
# horizon (see docs/PRIVACY — analytics retention).
_ANALYTICS_RETENTION_DAYS = 90


async def evaluate_price_alerts(_: dict[Any, Any]) -> dict[str, int]:
    """Check every active price alert against the latest prices, flag matches, and
    push a notification to the owner's devices (in addition to the in-app flag)."""
    async with SessionLocal() as db:
        triggered = await alert_service.evaluate_all(db)
        await db.commit()
        pushed = await notify_service.notify_price_drops(db, triggered) if triggered else 0
        await db.commit()
    return {"triggered": len(triggered), "pushed": pushed}


async def refresh_prices(_: dict[Any, Any]) -> dict[str, int]:
    """Scheduled real-price refresh (Open Prices). Runs in the worker so the
    public API never sees the crawl latency (see products/ingest.py)."""
    return await _refresh_prices()


async def prune_analytics(_: dict[Any, Any]) -> dict[str, int]:
    """Delete anonymous usage events past the retention window (GDPR data
    minimisation — see the privacy policy)."""
    cutoff = datetime.now(UTC) - timedelta(days=_ANALYTICS_RETENTION_DAYS)
    async with SessionLocal() as db:
        result = await db.execute(delete(AnalyticsEvent).where(AnalyticsEvent.created_at < cutoff))
        await db.commit()
    assert isinstance(result, CursorResult)
    return {"deleted": result.rowcount}
