"""Price-alert service — CRUD + the evaluation logic the worker runs."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.alerts.models import PriceAlert
from app.domains.alerts.schemas import AlertIn
from app.domains.products import service as product_service
from app.domains.products.models import PricePoint


async def current_best(db: AsyncSession, barcode: str) -> Decimal | None:
    return (
        await db.execute(
            select(PricePoint.price)
            .where(PricePoint.barcode == barcode)
            .order_by(PricePoint.price.asc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def list_alerts(db: AsyncSession, user_id: uuid.UUID) -> list[PriceAlert]:
    return list(
        (
            await db.execute(
                select(PriceAlert)
                .where(PriceAlert.user_id == user_id)
                .order_by(PriceAlert.created_at.desc())
            )
        ).scalars()
    )


async def create_alert(db: AsyncSession, user_id: uuid.UUID, data: AlertIn) -> PriceAlert:
    await product_service.get_product(db, data.barcode)  # ensure cached
    existing = (
        await db.execute(
            select(PriceAlert).where(
                PriceAlert.user_id == user_id, PriceAlert.barcode == data.barcode
            )
        )
    ).scalar_one_or_none()
    baseline = await current_best(db, data.barcode)
    if existing is not None:
        existing.target_price = data.target_price
        existing.active = True
        existing.baseline_price = baseline
        existing.triggered_at = None
        existing.triggered_price = None
        existing.acknowledged = False
        await db.flush()
        return existing

    alert = PriceAlert(
        user_id=user_id,
        barcode=data.barcode,
        target_price=data.target_price,
        baseline_price=baseline,
    )
    db.add(alert)
    await db.flush()
    return alert


async def delete_alert(db: AsyncSession, user_id: uuid.UUID, alert_id: uuid.UUID) -> None:
    alert = await db.get(PriceAlert, alert_id)
    if alert is None or alert.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    await db.delete(alert)


async def acknowledge(db: AsyncSession, user_id: uuid.UUID, alert_id: uuid.UUID) -> PriceAlert:
    alert = await db.get(PriceAlert, alert_id)
    if alert is None or alert.user_id != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    alert.acknowledged = True
    await db.flush()
    return alert


def _should_trigger(alert: PriceAlert, best: Decimal) -> bool:
    if alert.target_price is not None:
        return best <= alert.target_price
    # No target → trigger on a new low vs the recorded baseline.
    return alert.baseline_price is not None and best < alert.baseline_price


async def evaluate_all(db: AsyncSession) -> int:
    """Scan active, un-triggered alerts and mark those whose condition is met.

    Returns the number newly triggered. Called by the ARQ worker on a schedule.
    """
    alerts = list(
        (
            await db.execute(
                select(PriceAlert).where(
                    PriceAlert.active.is_(True), PriceAlert.triggered_at.is_(None)
                )
            )
        ).scalars()
    )
    triggered = 0
    now = datetime.now(UTC)
    for alert in alerts:
        best = await current_best(db, alert.barcode)
        if best is None:
            continue
        if _should_trigger(alert, best):
            alert.triggered_at = now
            alert.triggered_price = best
            alert.acknowledged = False
            triggered += 1
        # Track the lowest seen so a future dip still counts as a "new low".
        if alert.baseline_price is None or best < alert.baseline_price:
            alert.baseline_price = best
    return triggered
