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


class GeocodeHit(BaseModel):
    """One address match — lets a user who refuses geolocation type a place
    instead (GDPR: geolocation must not be the only way to use the feature)."""

    label: str = Field(description="Human-readable place name to show in a picker")
    lat: float
    lon: float


class GeocodeResult(BaseModel):
    items: list[GeocodeHit]
