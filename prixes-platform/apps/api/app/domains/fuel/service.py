"""Fuel service — nearby-station geo query (PostGIS ST_DWithin / ST_Distance)."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.fuel.models import FuelStation
from app.domains.fuel.schemas import FuelStationOut


async def nearby(
    db: AsyncSession,
    lat: float,
    lon: float,
    radius_km: float = 10.0,
    fuel_type: str | None = None,
    limit: int = 30,
) -> list[FuelStationOut]:
    point = func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326)
    distance = func.ST_Distance(FuelStation.geo, point)

    stmt = (
        select(FuelStation, distance.label("dist"))
        .where(func.ST_DWithin(FuelStation.geo, point, radius_km * 1000))
        .order_by(distance)
        .limit(limit)
    )
    if fuel_type:
        # JSONB ? operator: only stations advertising this fuel type.
        stmt = stmt.where(FuelStation.prices.op("?")(fuel_type))

    rows = (await db.execute(stmt)).all()
    return [
        FuelStationOut(
            id=s.id,
            brand=s.brand,
            address=s.address,
            city=s.city,
            postal_code=s.postal_code,
            lat=s.lat,
            lon=s.lon,
            distance_km=round(float(dist) / 1000, 2),
            prices={k: float(v) for k, v in (s.prices or {}).items()},
        )
        for s, dist in rows
    ]
