"""Price-alert HTTP API — per-user watchlist."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, status

from app.core.deps import CurrentUser, DbSession
from app.domains.alerts import service
from app.domains.alerts.models import PriceAlert
from app.domains.alerts.schemas import AlertIn, AlertListOut, AlertOut
from app.domains.products.models import Product

router = APIRouter(prefix="/alerts", tags=["alerts"])


async def _enrich(db: DbSession, alerts: list[PriceAlert]) -> list[AlertOut]:
    out: list[AlertOut] = []
    for a in alerts:
        product = await db.get(Product, a.barcode)
        dto = AlertOut.model_validate(a)
        dto.name = product.name if product else None
        dto.image_url = product.image_url if product else None
        dto.current_best = await service.current_best(db, a.barcode)
        dto.nutriscore = product.nutriscore if product else None
        out.append(dto)
    return out


@router.get("", response_model=AlertListOut)
async def list_alerts(db: DbSession, user: CurrentUser) -> AlertListOut:
    alerts = await service.list_alerts(db, user.id)
    enriched = await _enrich(db, alerts)
    return AlertListOut(items=enriched, total=len(enriched))


@router.post("", response_model=AlertOut, status_code=201)
async def create(data: AlertIn, db: DbSession, user: CurrentUser) -> AlertOut:
    alert = await service.create_alert(db, user.id, data)
    return (await _enrich(db, [alert]))[0]


@router.post("/{alert_id}/ack", response_model=AlertOut)
async def acknowledge(alert_id: uuid.UUID, db: DbSession, user: CurrentUser) -> AlertOut:
    alert = await service.acknowledge(db, user.id, alert_id)
    return (await _enrich(db, [alert]))[0]


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(alert_id: uuid.UUID, db: DbSession, user: CurrentUser) -> None:
    await service.delete_alert(db, user.id, alert_id)
