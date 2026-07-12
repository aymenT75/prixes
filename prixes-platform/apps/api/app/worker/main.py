"""ARQ worker — background ingestion + scheduled jobs.

Run with: `arq app.worker.main.WorkerSettings`
"""
from __future__ import annotations

from typing import Any

from arq import cron
from arq.connections import RedisSettings

from app.core.config import settings
from app.worker.tasks import evaluate_price_alerts, refresh_prices


async def healthcheck(_: dict[str, Any]) -> str:
    return "ok"


class WorkerSettings:
    functions = [healthcheck, evaluate_price_alerts, refresh_prices]
    redis_settings = RedisSettings.from_dsn(str(settings.redis_url))
    # The price crawl + OFF enrichment can take a couple of minutes; give jobs
    # generous headroom (default is 300s).
    job_timeout = 1200
    cron_jobs = [
        # Real supermarket prices — refresh every ~5 hours (background, no API latency).
        cron(refresh_prices, hour={0, 5, 10, 15, 20}, minute=20),
        # Re-check price alerts every 15 minutes (picks up new lows shortly after
        # each refresh).
        cron(evaluate_price_alerts, minute={0, 15, 30, 45}),
    ]
