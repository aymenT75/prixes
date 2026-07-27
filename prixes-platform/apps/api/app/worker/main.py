"""ARQ worker — background ingestion + scheduled jobs.

Run with: `arq app.worker.main.WorkerSettings`
"""
from __future__ import annotations

from typing import Any

from arq import cron
from arq.connections import RedisSettings

from app.core.config import settings
from app.worker.tasks import (
    evaluate_price_alerts,
    ingest_fuel,
    prune_analytics,
    refresh_prices,
)


async def healthcheck(_: dict[str, Any]) -> str:
    return "ok"


class WorkerSettings:
    functions = [
        healthcheck,
        evaluate_price_alerts,
        refresh_prices,
        prune_analytics,
        ingest_fuel,
    ]
    redis_settings = RedisSettings.from_dsn(str(settings.redis_url))
    # The price crawl + OFF enrichment can take a couple of minutes; give jobs
    # generous headroom (default is 300s).
    job_timeout = 1200
    # arq's WorkerCoroutine protocol declares `(ctx, *args, **kwargs)`, but cron
    # jobs are only ever invoked with `ctx` — the extra params don't apply here.
    cron_jobs = [
        # Real supermarket prices — refresh every ~3 hours (background, no API latency).
        cron(refresh_prices, hour={0, 3, 6, 9, 12, 15, 18, 21}, minute=15),  # type: ignore[arg-type]
        # Re-check price alerts every 15 minutes (picks up new lows shortly after
        # each refresh).
        cron(evaluate_price_alerts, minute={0, 15, 30, 45}),  # type: ignore[arg-type]
        # GDPR data minimisation — prune old anonymous analytics events daily.
        cron(prune_analytics, hour=4, minute=10),  # type: ignore[arg-type]
        # French fuel feed refreshes a few times a day; ingest hourly at :07.
        # run_at_startup so a fresh deploy repopulates prices immediately rather
        # than serving whatever was last cached.
        cron(ingest_fuel, minute=7, run_at_startup=True),  # type: ignore[arg-type]
    ]
