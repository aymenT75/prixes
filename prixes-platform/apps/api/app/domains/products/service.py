"""Product service: cache-aside lookup (Postgres + Redis), search, contributions."""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.products import off
from app.domains.products.models import PricePoint, Product
from app.domains.products.schemas import PriceContribution

logger = logging.getLogger(__name__)

# Products refresh weekly; prices hourly (ARCHITECTURE.md §8).
PRODUCT_TTL = timedelta(days=7)


async def get_product(db: AsyncSession, barcode: str) -> Product | None:
    """Return a product, fetching+caching from OpenFoodFacts on miss/stale."""
    product = await db.get(Product, barcode)
    # allergens is None only when never checked → force a refresh to backfill it
    # (existing catalog rows predate the allergen feature).
    fresh = (
        product is not None
        and (datetime.now(UTC) - product.fetched_at) < PRODUCT_TTL
        and product.allergens is not None
        and product.diets is not None
    )
    if fresh:
        return product

    data = await off.fetch_off_product(barcode)
    if data is None:
        if product is not None:
            if product.allergens is None:
                product.allergens = ""  # mark checked so we don't refetch each view
            if product.diets is None:
                product.diets = ""
            await db.flush()
        return product  # may be None; serve stale if we had it

    if product is None:
        product = Product(barcode=barcode)
        db.add(product)
    for key, value in data.items():
        setattr(product, key, value)
    if product.allergens is None:
        product.allergens = ""  # "" = checked, none declared
    if product.diets is None:
        product.diets = ""
    product.fetched_at = datetime.now(UTC)
    await db.flush()
    return product


async def get_product_detail(db: AsyncSession, barcode: str) -> tuple[Product, list[PricePoint]]:
    product = await get_product(db, barcode)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")

    prices = list(
        (
            await db.execute(
                select(PricePoint)
                .where(PricePoint.barcode == barcode)
                .order_by(PricePoint.created_at.desc())
                .limit(50)
            )
        ).scalars()
    )

    if not prices:  # warm from OpenPrices on first view
        for op in await off.fetch_openprices(barcode):
            if op.get("price") is None:
                continue
            pp = PricePoint(
                barcode=barcode,
                store=op.get("store"),
                price=Decimal(str(op["price"])),
                currency=op.get("currency", "EUR"),
                source="op",
                created_at=datetime.now(UTC),
            )
            db.add(pp)
            prices.append(pp)
        await db.flush()
    return product, prices


async def list_products(db: AsyncSession, limit: int = 40) -> list[Product]:
    """Browse the locally-cached catalog (seeded products), newest first."""
    return list(
        (
            await db.execute(
                select(Product)
                .where(Product.name.is_not(None))
                .order_by(Product.fetched_at.desc())
                .limit(limit)
            )
        ).scalars()
    )


async def search_products(db: AsyncSession, query: str, page: int) -> list[Product]:
    """Search products. Local-first (instant, real prices), OFF as a fallback.

    The local catalog already holds thousands of real French products with real
    store prices, so we match those first. OpenFoodFacts is only queried when the
    local catalog has nothing — and any upstream error/timeout is swallowed so the
    endpoint never 500s.
    """
    term = query.strip()
    if len(term) < 2:
        return []

    local = list(
        (
            await db.execute(
                select(Product)
                .where(Product.name.is_not(None), Product.name.ilike(f"%{term}%"))
                .order_by(Product.fetched_at.desc())
                .limit(40)
            )
        ).scalars()
    )
    if local:
        return local

    # Fallback: OpenFoodFacts (best-effort — never propagate upstream failures).
    try:
        results = await off.search_off(term, page=page)
    except TimeoutError:
        logger.warning(f"OpenFoodFacts search timeout for query: {term}")
        return []
    except (ConnectionError, OSError) as e:
        logger.warning(f"OpenFoodFacts connection error: {e}")
        return []
    except Exception as e:
        logger.error(f"Unexpected error searching OpenFoodFacts: {e}", exc_info=True)
        return []

    products: list[Product] = []
    for data in results:
        barcode = data["barcode"]
        product = await db.get(Product, barcode)
        if product is None:
            product = Product(barcode=barcode)
            db.add(product)
        for key, value in data.items():
            setattr(product, key, value)
        product.fetched_at = datetime.now(UTC)
        products.append(product)
    await db.flush()
    return products


async def price_history(
    db: AsyncSession, barcode: str, days: int = 730
) -> list[tuple[date, Decimal]]:
    """Daily lowest price for a product over the last `days` days (oldest first)."""
    since = datetime.now(UTC) - timedelta(days=days)
    day_col = func.date_trunc("day", PricePoint.created_at)
    rows = (
        await db.execute(
            select(day_col.label("day"), func.min(PricePoint.price).label("price"))
            .where(PricePoint.barcode == barcode, PricePoint.created_at >= since)
            .group_by(day_col)
            .order_by(day_col.asc())
        )
    ).all()
    out: list[tuple[date, Decimal]] = []
    for r in rows:
        d = r.day
        out.append((d.date() if isinstance(d, datetime) else d, r.price))
    return out


async def healthier_alternatives(
    db: AsyncSession, barcode: str, limit: int = 6
) -> list[Product]:
    """Same-category products with a better Nutri-Score (best first).

    Matches on the product's most-specific category tokens. When the current
    product has no Nutri-Score we still surface scored alternatives in the
    category (ranked best-first), which is what a shopper wants anyway.
    """
    product = await db.get(Product, barcode)
    if product is None or not product.categories:
        return []
    tokens = [t.strip() for t in product.categories.split(",") if t.strip()]
    if not tokens:
        return []

    specific = tokens[-3:]  # most specific are last in OFF category chains
    conds = [Product.categories.ilike(f"%{t}%") for t in specific]
    stmt = (
        select(Product)
        .where(
            Product.barcode != barcode,
            Product.name.is_not(None),
            Product.nutriscore.is_not(None),
            or_(*conds),
        )
        .order_by(Product.nutriscore.asc())
        .limit(limit)
    )
    if product.nutriscore:
        stmt = stmt.where(Product.nutriscore < product.nutriscore)
    return list((await db.execute(stmt)).scalars())


async def contribute_price(
    db: AsyncSession, barcode: str, user_id: uuid.UUID, data: PriceContribution
) -> PricePoint:
    await get_product(db, barcode)  # ensure product exists/cached
    pp = PricePoint(
        barcode=barcode,
        store=data.store,
        price=data.price,
        currency=data.currency,
        source="user",
        contributor_id=user_id,
        location=data.location,
        created_at=datetime.now(UTC),
    )
    db.add(pp)
    await db.flush()
    return pp
