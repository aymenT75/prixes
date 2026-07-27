"""Smoke tests — app boots, health + auth + ranking behave."""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_health() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"




def test_openapi_contains_domains() -> None:
    paths = app.openapi()["paths"]
    assert "/api/v1/auth/login" in paths
    assert "/api/v1/stores/nearby" in paths
    assert "/api/v1/users/me/export" in paths  # GDPR
    # Fuel is back (national price feed), Deals is gone in its place.
    assert "/api/v1/fuel/nearby" in paths
    assert "/api/v1/deals" not in paths
    # Real price-drop "bonnes affaires" replaces what community-submitted deals used
    # to cover, computed from our own price history instead.
    assert "/api/v1/products/bargains" in paths
