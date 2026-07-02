"""Fuel station schemas."""
from __future__ import annotations

from pydantic import BaseModel


class FuelStationOut(BaseModel):
    id: int
    brand: str | None
    address: str | None
    city: str | None
    postal_code: str | None
    lat: float
    lon: float
    distance_km: float | None = None
    prices: dict[str, float]


class FuelNearbyResult(BaseModel):
    fuel_type: str | None
    items: list[FuelStationOut]
