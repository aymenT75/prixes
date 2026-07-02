"""Fuel HTTP API — nearby stations by coordinates."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import DbSession
from app.domains.fuel import service
from app.domains.fuel.schemas import FuelNearbyResult

router = APIRouter(prefix="/fuel", tags=["fuel"])


@router.get("/nearby", response_model=FuelNearbyResult)
async def nearby(
    db: DbSession,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
    radius_km: Annotated[float, Query(gt=0, le=50)] = 10.0,
    fuel_type: Annotated[str | None, Query(max_length=12)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> FuelNearbyResult:
    items = await service.nearby(db, lat, lon, radius_km, fuel_type, limit)
    return FuelNearbyResult(fuel_type=fuel_type, items=items)
