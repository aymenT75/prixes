"""Stores HTTP API — nearby supermarket discovery (OpenStreetMap)."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.rate_limit import RateLimit
from app.domains.stores import service
from app.domains.stores.schemas import GeocodeResult, StoresNearbyResult

router = APIRouter(prefix="/stores", tags=["stores"])


@router.get("/nearby", response_model=StoresNearbyResult)
async def nearby_stores(
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
    radius_km: Annotated[float, Query(ge=0.5, le=50)] = 5.0,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> StoresNearbyResult:
    """Supermarkets near the given coordinates, nearest first."""
    items = await service.nearby(lat, lon, radius_km, limit)
    return StoresNearbyResult(items=items)


@router.get(
    "/geocode",
    response_model=GeocodeResult,
    dependencies=[Depends(RateLimit("geocode", times=20, window=60))],
)
async def geocode_address(
    q: Annotated[str, Query(min_length=3, max_length=200)],
) -> GeocodeResult:
    """Resolve a typed place to coordinates — the fallback for users who
    decline the geolocation prompt (GDPR: consent must have a real alternative)."""
    items = await service.geocode(q)
    return GeocodeResult(items=items)
