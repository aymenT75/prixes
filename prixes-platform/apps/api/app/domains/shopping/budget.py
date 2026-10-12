"""The month's shopping: what was spent, what was saved, against the budget.

A trip is recorded when the in-store guide ends ("Courses terminées"), with the
total the shopper confirms. Months are French calendar months.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.shopping import pantry
from app.domains.shopping.models import ShoppingBudget, ShoppingTrip
from app.domains.shopping.schemas import BudgetOut, TripIn
from app.domains.shopping.watch import _last_sunday

# Past this share of the budget, the month is flagged as close to the limit.
WARN_AT = Decimal("0.8")


def month_start(now: datetime) -> datetime:
    """Midnight on the 1st of this month in France, as a UTC instant.

    The EU summer-time rule by hand, like watch._paris_hour: the time-zone
    database is not in every image this runs in.
    """
    now = now.astimezone(UTC)
    start = _last_sunday(now.year, 3).replace(hour=1)
    end = _last_sunday(now.year, 10).replace(hour=1)
    offset = timedelta(hours=2 if start <= now < end else 1)
    local = now + offset
    first = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return first - offset


def week_start(now: datetime) -> datetime:
    """Monday 00:00 in France, as a naive UTC instant (like created_at)."""
    now = now.astimezone(UTC)
    start = _last_sunday(now.year, 3).replace(hour=1)
    end = _last_sunday(now.year, 10).replace(hour=1)
    offset = timedelta(hours=2 if start <= now < end else 1)
    local = now + offset
    monday = (local - timedelta(days=local.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return (monday - offset).replace(tzinfo=None)


async def summary(db: AsyncSession, owner_id: uuid.UUID, now: datetime | None = None) -> BudgetOut:
    now = now or datetime.now(UTC)
    # created_at is mapped without a time zone (TimestampMixin): compare in naive UTC.
    since = month_start(now).replace(tzinfo=None)
    monday = week_start(now)
    week_spent, week_saved = (
        await db.execute(
            select(
                func.coalesce(func.sum(ShoppingTrip.total), 0),
                func.coalesce(func.sum(ShoppingTrip.saving), 0),
            ).where(ShoppingTrip.owner_id == owner_id, ShoppingTrip.created_at >= monday)
        )
    ).one()
    week_pantry = await pantry.avoided_since(db, owner_id, monday)
    spent, saved, trips = (
        await db.execute(
            select(
                func.coalesce(func.sum(ShoppingTrip.total), 0),
                func.coalesce(func.sum(ShoppingTrip.saving), 0),
                func.count(ShoppingTrip.id),
            ).where(ShoppingTrip.owner_id == owner_id, ShoppingTrip.created_at >= since)
        )
    ).one()
    budget = await db.get(ShoppingBudget, owner_id)
    monthly = budget.monthly if budget else None
    spent, saved = Decimal(spent), Decimal(saved)
    return BudgetOut(
        monthly=monthly,
        spent=spent.quantize(Decimal("0.01")),
        saved=saved.quantize(Decimal("0.01")),
        trips=int(trips),
        left=(monthly - spent).quantize(Decimal("0.01")) if monthly is not None else None,
        warning=monthly is not None and spent >= monthly * WARN_AT,
        week_saved=Decimal(week_saved).quantize(Decimal("0.01")),
        week_pantry=week_pantry.quantize(Decimal("0.01")),
        week_spent=Decimal(week_spent).quantize(Decimal("0.01")),
    )


async def set_monthly(db: AsyncSession, owner_id: uuid.UUID, monthly: Decimal | None) -> None:
    budget = await db.get(ShoppingBudget, owner_id)
    if monthly is None:
        if budget:
            await db.delete(budget)
    elif budget:
        budget.monthly = monthly
    else:
        db.add(ShoppingBudget(owner_id=owner_id, monthly=monthly))
    await db.commit()


async def record_trip(
    db: AsyncSession, owner_id: uuid.UUID, user_id: uuid.UUID, trip: TripIn
) -> None:
    db.add(
        ShoppingTrip(
            owner_id=owner_id,
            user_id=user_id,
            store=trip.store,
            total=trip.total,
            saving=trip.saving,
            items=trip.items,
        )
    )
    await db.commit()
