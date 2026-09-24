"""Products HTTP API — barcode lookup, search, price contributions."""
from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.core.rate_limit import RateLimit
from app.domains.billing.deps import PremiumUser
from app.domains.products import service
from app.domains.products.models import PricePoint
from app.domains.products.recognize import recognize_product
from app.domains.products.schemas import (
    AlternativeOut,
    AlternativesOut,
    BargainOut,
    BargainsOut,
    NutrientKey,
    PriceContribution,
    PriceContributionOut,
    PriceHistoryOut,
    PriceHistoryPoint,
    PricePointOut,
    ProductCreate,
    ProductDetail,
    ProductOut,
    ProductSearchItem,
    ProductSearchResult,
    RecognizeIn,
    RecognizeOut,
    RichInItem,
    RichInOut,
)
from app.domains.products.units import unit_price

router = APIRouter(prefix="/products", tags=["products"])

# A phone sees a handful of chains around it; anything beyond that is someone
# probing the endpoint, not a shopper.
_MAX_NEARBY_STORES = 12


@router.get("", response_model=ProductSearchResult)
async def browse(
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 40,
) -> ProductSearchResult:
    """Default catalog listing (seeded products) for the Courses tab."""
    products = await service.list_products(db, limit)
    # Same item shape as /search so the client has one type, not two — browse
    # simply leaves the price fields empty rather than pretending to know one.
    return ProductSearchResult(
        items=[ProductSearchItem.model_validate(p) for p in products],
        total=len(products),
    )


@router.post(
    "/recognize",
    response_model=RecognizeOut,
    dependencies=[Depends(RateLimit("recognize", times=30, window=3600))],
)
async def recognize(data: RecognizeIn, user: PremiumUser) -> RecognizeOut:
    """AI vision fallback: name a product from a photo when its barcode isn't in our
    catalog. Premium (a paid vision call); available=False when no vision key is set."""
    if not (settings.openai_api_key or settings.anthropic_api_key):
        return RecognizeOut(available=False)
    name, brand = await recognize_product(data.image, data.media_type)
    return RecognizeOut(available=True, product_name=name, brand=brand)


@router.post("", response_model=ProductOut, status_code=201)
async def create(data: ProductCreate, db: DbSession, user: CurrentUser) -> ProductOut:
    """Add a product we don't have (scanned barcode absent from OpenFoodFacts).
    Authenticated to keep the catalog from being spammed anonymously."""
    product = await service.create_product(db, data)
    return ProductOut.model_validate(product)


@router.get("/search", response_model=ProductSearchResult)
async def search(
    db: DbSession,
    q: Annotated[str, Query(min_length=2, max_length=100)],
    page: Annotated[int, Query(ge=1, le=20)] = 1,
    stores: Annotated[str | None, Query(max_length=400)] = None,
) -> ProductSearchResult:
    """Search the catalogue, cheapest first.

    `stores` is a comma-separated list of the chains near the caller. When it is
    given, a product priced at one of them outranks a cheaper one that is not:
    a price at a shop they cannot reach is not an offer. Without it the ranking
    falls back to the cheapest price anywhere, which is still more useful than
    the alphabetical accident it replaced.
    """
    nearby = [s for s in (stores or "").split(",") if s.strip()][:_MAX_NEARBY_STORES]
    products = await service.search_products(db, q, page)
    ranked = await service.rank_by_price(db, products, nearby)
    items = []
    for hit in ranked:
        item = ProductSearchItem.model_validate(hit.product)
        item.best_price = hit.best_price
        item.best_store = hit.best_store
        item.nearby = hit.nearby
        if (per_unit := unit_price(hit.best_price, hit.product.quantity)) is not None:
            item.best_unit_price, item.unit_label = per_unit
        items.append(item)
    return ProductSearchResult(
        items=items, total=len(items), ranked_by_nearby=any(i.nearby for i in items)
    )


@router.get("/bargains", response_model=BargainsOut)
async def bargains(
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=40)] = 12,
) -> BargainsOut:
    """Real price drops for the home screen, computed from our own price history —
    no external catalog dependency."""
    rows = await service.list_bargains(db, limit)
    return BargainsOut(
        items=[
            BargainOut(
                **ProductOut.model_validate(r["product"]).model_dump(),
                store=r["store"],
                price=r["price"],
                reference_price=r["reference_price"],
                drop_pct=r["drop_pct"],
            )
            for r in rows
        ]
    )


@router.get("/rich-in/{nutrient}", response_model=RichInOut)
async def rich_in(
    nutrient: NutrientKey,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=40)] = 12,
) -> RichInOut:
    """Catalog products ranked by nutrient content per 100 g, each with its best
    known price. Consumed by Hi Coach to turn a nutrient gap into a purchase
    suggestion — an anonymous nutrient name in, a priced product list out, no
    health data ever crossing into this app."""
    rows = await service.rich_in_nutrient(db, nutrient, limit)
    return RichInOut(
        nutrient=nutrient,
        items=[RichInItem.model_validate(r) for r in rows],
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
    if not products:
        return AlternativesOut(items=[])

    # Fix N+1 query: fetch all best prices in ONE query, not per-product
    from sqlalchemy import func
    barcodes = [p.barcode for p in products]
    best_prices = (
        await db.execute(
            select(
                PricePoint.barcode,
                func.min(PricePoint.price).label("price")
            )
            .where(PricePoint.barcode.in_(barcodes))
            .group_by(PricePoint.barcode)
        )
    ).all()
    price_map = {row.barcode: row.price for row in best_prices}

    items: list[AlternativeOut] = []
    for p in products:
        item = AlternativeOut.model_validate(p)
        item.best_price = price_map.get(p.barcode)
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
