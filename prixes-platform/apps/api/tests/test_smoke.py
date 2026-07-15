"""Smoke tests — app boots, health + auth + ranking behave."""
from __future__ import annotations

from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.ranking import hot_score
from app.main import app


@pytest.mark.asyncio
async def test_health() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_hot_score_orders_by_votes() -> None:
    now = datetime.now(UTC)
    assert hot_score(50, 0, now) > hot_score(2, 0, now)


def test_hot_score_rewards_recency() -> None:
    older = datetime(2025, 1, 2, tzinfo=UTC)
    newer = datetime(2025, 6, 1, tzinfo=UTC)
    assert hot_score(5, 0, newer) > hot_score(5, 0, older)


def test_openapi_contains_domains() -> None:
    paths = app.openapi()["paths"]
    assert "/api/v1/auth/login" in paths
    assert "/api/v1/deals" in paths
    assert "/api/v1/stores/nearby" in paths
    assert "/api/v1/users/me/export" in paths  # GDPR
    assert "/api/v1/moderation/reports" in paths
    # The fuel domain was removed (too many bugs) — make sure it stays gone.
    assert "/api/v1/fuel/nearby" not in paths
