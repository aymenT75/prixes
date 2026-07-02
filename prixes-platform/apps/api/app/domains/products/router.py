"""Products HTTP API — barcode lookup, search, price contributions."""
from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.domains.products import service
from app.domains.products.models import PricePoint
from app.domains.products.schemas import (
    AlternativeOut,
    AlternativesOut,
    PriceContribution,
    PriceContributionOut,
    PriceHistoryOut,
    PriceHistoryPoint,
    PricePointOut,
    ProductDetail,
    ProductOut,
    ProductSearchResult,
)
from app.domains.products.units import unit_price
from sqlalchemy import select

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=ProductSearchResult)
async def browse(
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 40,
) -> ProductSearchResult:
    """Default catalog listing (seeded products) for the Courses tab."""
    products = await service.list_products(db, limit)
    return ProductSearchResult(
        items=[ProductOut.model_validate(p) for p in products], total=len(products)
    )


@router.get("/search", response_model=ProductSearchResult)
async def search(
    db: DbSession,
    q: Annotated[str, Query(min_length=2, max_length=100)],
    page: Annotated[int, Query(ge=1, le=20)] = 1,
) -> ProductSearchResult:
    products = await service.search_products(db, q, page)
    return ProductSearchResult(
        items=[ProductOut.model_validate(p) for p in products], total=len(products)
    )


@router.get("/{barcode}", response_model=ProductDetail)
async def get_product(barcode: str, db: DbSession) -> ProductDetail:
    product, prices = await service.get_product_detail(db, barcode)
    detail = ProductDetail.model_validate(product)

    out: list[PricePointOut] = []
    best_unit: tuple[Decimal, str] | None = None
    for p in prices:
        up = unit_price(p.price, product.quantity)
        item = PricePointOut.model_validate(p)
        if up is not None:
            item.unit_price, item.unit_label = up
            if best_unit is None or up[0] < best_unit[0]:
                best_unit = up
        out.append(item)

    detail.prices = out
    valid = [p.price for p in prices if p.price is not None]
    detail.best_price = min(valid) if valid else None
    if best_unit is not None:
        detail.best_unit_price, detail.unit_label = best_unit
    return detail


@router.get("/{barcode}/history", response_model=PriceHistoryOut)
async def price_history(
    barcode: str,
    db: DbSession,
    # Community price data is sparse and can span years, so default to a wide
    # window rather than 90 days (which would leave most charts empty).
    days: Annotated[int, Query(ge=7, le=3650)] = 730,
) -> PriceHistoryOut:
    rows = await service.price_history(db, barcode, days)
    points = [PriceHistoryPoint(day=d, price=p) for d, p in rows]
    prices = [p.price for p in points]
    return PriceHistoryOut(
        barcode=barcode,
        points=points,
        lowest=min(prices) if prices else None,
        highest=max(prices) if prices else None,
    )


@router.get("/{barcode}/alternatives", response_model=AlternativesOut)
async def alternatives(barcode: str, db: DbSession) -> AlternativesOut:
    products = await service.healthier_alternatives(db, barcode)
    items: list[AlternativeOut] = []
    for p in products:
        best = (
            await db.execute(
                select(PricePoint.price)
                .where(PricePoint.barcode == p.barcode)
                .order_by(PricePoint.price.asc())
                .limit(1)
            )
        ).scalar_one_or_none()
        item = AlternativeOut.model_validate(p)
        item.best_price = best
        items.append(item)
    return AlternativesOut(items=items)


@router.post(
    "/{barcode}/prices", response_model=PriceContributionOut, status_code=201
)
async def contribute(
    barcode: str, data: PriceContribution, db: DbSession, user: CurrentUser
) -> PriceContributionOut:
    pp = await service.contribute_price(db, barcode, user.id, data)
    return PriceContributionOut(id=pp.id, barcode=barcode, price=pp.price, store=pp.store)
