"""Stores schemas — nearby supermarket discovery."""
from __future__ import annotations

from pydantic import BaseModel, Field


class StoreOut(BaseModel):
    """A supermarket POI with distance from the user."""

    id: int = Field(description="OpenStreetMap element id")
    name: str
    brand: str | None = None
    address: str | None = None
    lat: float
    lon: float
    distance_km: float = Field(description="Straight-line distance from the user, km")


class StoresNearbyResult(BaseModel):
    items: list[StoreOut]
