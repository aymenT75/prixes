"""Auto-generated deals from observed cross-store price spreads.

Community deal submissions can be zero for long stretches (nobody has posted
one yet), which leaves the Deals tab empty. This derives real "bons plans"
straight from already-ingested `PricePoint` rows — the same data the product
comparison page reads — so the tab always has something legitimate to show.
Runs on a schedule (see worker/tasks.py::refresh_deals) under a dedicated
system account; it only ever touches deals it authored itself, never a real
user's submission.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ranking import hot_score
from app.core.redis import FEED_HOT, FEED_NEW, redis_client
from app.domains.deals.models import Deal
from app.domains.products.models import PricePoint, Product
from app.domains.users.models import User

SYSTEM_EMAIL = "bons-plans@prixes.app"
SYSTEM_USERNAME = "Bons plans Prixes"

MAX_AUTO_DEALS = 20
MIN_DISCOUNT_PCT = 8.0
MAX_DISCOUNT_PCT = 70.0  # beyond this it's almost certainly a data glitch, not a real deal
PRICE_LOOKBACK_DAYS = 30
DEAL_LIFETIME_DAYS = 2

CandidateRow = tuple[str, Decimal, Decimal, int]  # barcode, cheapest, dearest, n_stores


def select_candidates(
    rows: list[CandidateRow], max_deals: int = MAX_AUTO_DEALS
) -> list[tuple[str, Decimal, Decimal, float]]:
    """Filter+rank (barcode, cheapest, dearest, n_stores) rows by discount %.

    Pure function (no I/O) so the selection/ranking logic is unit-testable
    without a database.
    """
    candidates: list[tuple[str, Decimal, Decimal, float]] = []
    for barcode, cheapest, dearest, n_stores in rows:
        if n_stores < 2 or cheapest <= 0 or dearest <= cheapest:
            continue
        pct = float((dearest - cheapest) / dearest) * 100
        if MIN_DISCOUNT_PCT <= pct <= MAX_DISCOUNT_PCT:
            candidates.append((barcode, cheapest, dearest, pct))
    candidates.sort(key=lambda c: c[3], reverse=True)
    return candidates[:max_deals]


async def _system_author(db: AsyncSession) -> User:
    user = (
        await db.execute(select(User).where(User.email == SYSTEM_EMAIL))
    ).scalar_one_or_none()
    if user is None:
        user = User(
            email=SYSTEM_EMAIL,
            username=SYSTEM_USERNAME,
            initials="BP",
            is_verified=True,
            role="user",
        )
        db.add(user)
        await db.flush()
    return user


async def refresh_auto_deals(db: AsyncSession) -> dict[str, int]:
    """Expire this bot's previous deals and recreate today's best price spreads.
    Never touches deals authored by real users."""
    author = await _system_author(db)

    expired_ids = (
        await db.execute(
            select(Deal.id).where(Deal.author_id == author.id, Deal.status == "active")
        )
    ).scalars().all()
    if expired_ids:
        await db.execute(
            update(Deal).where(Deal.id.in_(expired_ids)).values(status="expired")
        )
        await redis_client.zrem(FEED_HOT, *[str(i) for i in expired_ids])
        await redis_client.zrem(FEED_NEW, *[str(i) for i in expired_ids])

    cutoff = datetime.now(UTC) - timedelta(days=PRICE_LOOKBACK_DAYS)
    rows = (
        await db.execute(
            select(
                PricePoint.barcode,
                func.min(PricePoint.price),
                func.max(PricePoint.price),
                func.count(func.distinct(PricePoint.store)),
            )
            .where(PricePoint.created_at >= cutoff)
            .group_by(PricePoint.barcode)
            .having(func.count(func.distinct(PricePoint.store)) >= 2)
        )
    ).all()
    candidates = select_candidates([tuple(r) for r in rows])

    now = datetime.now(UTC)
    created = 0
    for barcode, cheapest, dearest, _pct in candidates:
        product = await db.get(Product, barcode)
        if product is None or not product.name:
            continue
        cheapest_store = await db.scalar(
            select(PricePoint.store)
            .where(
                PricePoint.barcode == barcode,
                PricePoint.price == cheapest,
                PricePoint.created_at >= cutoff,
            )
            .limit(1)
        )
        deal = Deal(
            author_id=author.id,
            title=f"{product.name} — {product.brand or 'bon prix'}"[:200],
            description="Écart de prix repéré automatiquement entre plusieurs enseignes.",
            store=cheapest_store,
            category=(product.categories or "")[:64] or None,
            price_now=cheapest,
            price_before=dearest,
            photo_url=product.image_url,
            expires_at=now + timedelta(days=DEAL_LIFETIME_DAYS),
        )
        deal.score = hot_score(0, 0, now)
        db.add(deal)
        created += 1
    await db.flush()
    author.deals_count = created

    fresh = (
        await db.execute(select(Deal).where(Deal.author_id == author.id, Deal.status == "active"))
    ).scalars().all()
    if fresh:
        await redis_client.zadd(FEED_HOT, {str(d.id): float(d.score) for d in fresh})
        await redis_client.zadd(FEED_NEW, {str(d.id): d.created_at.timestamp() for d in fresh})

    return {"expired": len(expired_ids), "created": created}
