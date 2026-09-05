"""Nutrient-ranked product suggestions — the "what should I buy" endpoint a
separate coach app (Hi Coach) calls when it detects a gap against someone's
daily targets. This service owns the catalog and the prices; the coach owns
who has a gap in what.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.db import SessionLocal
from app.domains.products import service
from app.domains.products.models import PricePoint, Product
from app.main import app

# The async engine in app.core.db is a module-level singleton whose pooled
# asyncpg connections are bound to whichever event loop first used them.
# pytest-asyncio's default is a fresh loop per test, which then tries to
# recycle a connection against a loop that no longer exists ("Event loop is
# closed"). A shared loop for this whole module matches the engine's actual
# lifetime and avoids that mismatch — no other test file touches the DB.
pytestmark = pytest.mark.asyncio(loop_scope="module")

# Unique-ish prefix so this test's rows never collide with real catalog data or
# other tests sharing the same database.
_PREFIX = "9999999"


def _barcode(suffix: str) -> str:
    return f"{_PREFIX}{suffix}"


@asynccontextmanager
async def fibre_products():
    """Three fibre-bearing products, one with no price yet (must be excluded).

    A plain async context manager rather than a pytest fixture: an async
    generator *fixture* ties its teardown to whatever event loop pytest-asyncio
    hands the fixture, which is not guaranteed to be the same loop the test body
    runs on — a bare `async with` inside the test body has no such mismatch.
    """
    now = datetime.now(UTC)
    async with SessionLocal() as db:
        high = Product(
            barcode=_barcode("1"), name="Son d'avoine", fiber_100g=Decimal("42.0"),
            allergens="", diets="", fetched_at=now, nutrition_checked_at=now,
        )
        mid = Product(
            barcode=_barcode("2"), name="Lentilles corail", fiber_100g=Decimal("8.0"),
            allergens="", diets="", fetched_at=now, nutrition_checked_at=now,
        )
        unpriced = Product(
            barcode=_barcode("3"), name="Sans prix connu", fiber_100g=Decimal("50.0"),
            allergens="", diets="", fetched_at=now, nutrition_checked_at=now,
        )
        db.add_all([high, mid, unpriced])
        await db.flush()
        db.add(PricePoint(
            barcode=high.barcode, price=Decimal("3.50"), currency="EUR",
            source="user", created_at=now,
        ))
        db.add(PricePoint(
            barcode=mid.barcode, price=Decimal("1.90"), currency="EUR",
            source="user", created_at=now,
        ))
        await db.commit()
    try:
        yield
    finally:
        async with SessionLocal() as db:
            for suffix in ("1", "2", "3"):
                bc = _barcode(suffix)
                await db.execute(PricePoint.__table__.delete().where(PricePoint.barcode == bc))
                product = await db.get(Product, bc)
                if product is not None:
                    await db.delete(product)
            await db.commit()


class TestListRichIn:
    async def test_ranks_by_nutrient_descending(self) -> None:
        async with fibre_products():
            async with SessionLocal() as db:
                rows = await service.list_rich_in(db, "fiber", limit=10)
            ours = [r for r in rows if r["product"].barcode.startswith(_PREFIX)]
            assert [r["product"].barcode for r in ours] == [_barcode("1"), _barcode("2")]

    async def test_excludes_products_with_no_known_price(self) -> None:
        async with fibre_products():
            async with SessionLocal() as db:
                rows = await service.list_rich_in(db, "fiber", limit=10)
            barcodes = {r["product"].barcode for r in rows}
            assert _barcode("3") not in barcodes  # highest fibre value, but unpriced

    async def test_reports_the_cheapest_known_price(self) -> None:
        async with fibre_products():
            async with SessionLocal() as db:
                rows = await service.list_rich_in(db, "fiber", limit=10)
            row = next(r for r in rows if r["product"].barcode == _barcode("1"))
            assert row["best_price"] == Decimal("3.50")
            assert row["nutrient_value"] == 42.0

    async def test_unknown_nutrient_is_not_in_the_allow_list(self) -> None:
        assert "sugar" not in service.RICH_IN_COLUMNS
        assert "energy_kcal" not in service.RICH_IN_COLUMNS


class TestRichInEndpoint:
    async def test_returns_ranked_priced_products(self) -> None:
        async with fibre_products():
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/api/v1/products/rich-in/fiber")
            assert resp.status_code == 200
            barcodes = [item["barcode"] for item in resp.json()["items"]]
            assert _barcode("1") in barcodes
            assert _barcode("3") not in barcodes

    async def test_rejects_an_unlisted_nutrient(self) -> None:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/products/rich-in/sugar")
        assert resp.status_code == 422  # not in the Literal — never reaches the DB

    async def test_does_not_shadow_the_barcode_route(self) -> None:
        """Route order regression guard: /{barcode} must not swallow /rich-in/*."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/products/rich-in/protein")
        assert resp.status_code == 200
