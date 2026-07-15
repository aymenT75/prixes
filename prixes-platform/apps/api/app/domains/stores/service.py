"""Stores service — nearby supermarkets from OpenStreetMap (Overpass API).

Prixes has no geocoded store dataset of its own (price points only carry a
free-text location), so we query OpenStreetMap live for `shop=supermarket` POIs
around the user and rank them by straight-line distance.

The public Overpass API is aggressively rate-limited, so results are cached in
Redis keyed by *rounded* coordinates (~110 m grid): nearby users share a single
upstream fetch, and we keep serving during rate-limit windows. Distances are
computed per-request from the caller's exact position, so the cached, distance-
free POI list stays reusable across slightly different locations. Failures are
never cached, and any upstream error yields an empty list rather than a 500.
"""
from __future__ import annotations

from math import asin, cos, radians, sin, sqrt
from typing import Any, cast

import orjson

from app.core.http import get_http_client
from app.core.redis import redis_client
from app.domains.stores.schemas import GeocodeHit, StoreOut

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

# Address lookups don't change; cache aggressively to spare the (free, shared)
# Nominatim usage-policy-limited endpoint.
_GEOCODE_CACHE_TTL = 7 * 24 * 3600

# shop tags we treat as "supermarket" for this feature.
_SHOP_TYPES = ("supermarket", "convenience", "grocery")

# Supermarket POIs are stable; cache the raw list for 6h to spare the upstream.
_CACHE_TTL = 6 * 3600


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two WGS84 points, in kilometres."""
    r = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * r * asin(sqrt(a))


def _address(tags: dict[str, Any]) -> str | None:
    street = " ".join(
        p for p in (tags.get("addr:housenumber"), tags.get("addr:street")) if p
    )
    joined = ", ".join(p for p in (street, tags.get("addr:city")) if p)
    return joined or None


def _element_coords(el: dict[str, Any]) -> tuple[float, float] | None:
    """Node coords are on the element; way/relation coords are under `center`."""
    if "lat" in el and "lon" in el:
        return float(el["lat"]), float(el["lon"])
    center = el.get("center")
    if center and "lat" in center and "lon" in center:
        return float(center["lat"]), float(center["lon"])
    return None


def _build_query(lat: float, lon: float, radius_m: int) -> str:
    shop_re = "|".join(_SHOP_TYPES)
    return (
        f"[out:json][timeout:20];"
        f'(node["shop"~"^({shop_re})$"](around:{radius_m},{lat},{lon});'
        f'way["shop"~"^({shop_re})$"](around:{radius_m},{lat},{lon}););'
        f"out center tags;"
    )


async def _fetch_pois(lat: float, lon: float, radius_km: float) -> list[dict[str, Any]]:
    """Raw supermarket POIs (no distance) from Overpass. Empty on any failure."""
    query = _build_query(lat, lon, int(radius_km * 1000))
    try:
        resp = await get_http_client().post(
            OVERPASS_URL, data={"data": query}, timeout=25.0
        )
        resp.raise_for_status()
        elements = resp.json().get("elements", [])
    except Exception:  # noqa: BLE001 — never propagate upstream failures
        return []

    pois: list[dict[str, Any]] = []
    for el in elements:
        coords = _element_coords(el)
        if coords is None:
            continue
        tags = el.get("tags") or {}
        name = tags.get("name") or tags.get("brand")
        if not name:
            continue  # unnamed POIs aren't useful to show
        pois.append(
            {
                "id": int(el["id"]),
                "name": name,
                "brand": tags.get("brand"),
                "address": _address(tags),
                "lat": coords[0],
                "lon": coords[1],
            }
        )
    return pois


async def _cached_pois(lat: float, lon: float, radius_km: float) -> list[dict[str, Any]]:
    """Cache-aside on a ~110 m grid. Only successful (non-empty) fetches are cached."""
    key = f"stores:osm:{round(lat, 3)}:{round(lon, 3)}:{radius_km}"
    cached = await redis_client.get(key)
    if cached is not None:
        return cast("list[dict[str, Any]]", orjson.loads(cached))
    pois = await _fetch_pois(lat, lon, radius_km)
    if pois:  # don't cache empty/failed responses (avoids poisoning during rate-limits)
        await redis_client.set(key, orjson.dumps(pois), ex=_CACHE_TTL)
    return pois


async def nearby(
    lat: float, lon: float, radius_km: float = 5.0, limit: int = 20
) -> list[StoreOut]:
    """Supermarkets near (lat, lon), nearest first. Empty on any upstream failure."""
    pois = await _cached_pois(lat, lon, radius_km)
    stores = [
        StoreOut(
            id=p["id"],
            name=p["name"],
            brand=p["brand"],
            address=p["address"],
            lat=p["lat"],
            lon=p["lon"],
            distance_km=round(_haversine_km(lat, lon, p["lat"], p["lon"]), 2),
        )
        for p in pois
    ]
    stores.sort(key=lambda s: s.distance_km)
    return stores[:limit]


async def geocode(query: str) -> list[GeocodeHit]:
    """Resolve a free-text place (city, street, postcode) to coordinates via
    Nominatim — lets someone who declines the geolocation prompt still find
    nearby stores by typing where they are. Empty on any upstream failure."""
    key = f"stores:geocode:{query.strip().lower()}"
    cached = await redis_client.get(key)
    if cached is not None:
        return [GeocodeHit(**h) for h in orjson.loads(cached)]

    try:
        resp = await get_http_client().get(
            NOMINATIM_URL,
            params={
                "q": query,
                "format": "jsonv2",
                "countrycodes": "fr",
                "limit": 5,
            },
        )
        resp.raise_for_status()
        results = resp.json()
    except Exception:  # noqa: BLE001 — never propagate upstream failures
        return []

    hits = [
        GeocodeHit(label=r["display_name"], lat=float(r["lat"]), lon=float(r["lon"]))
        for r in results
        if "display_name" in r and "lat" in r and "lon" in r
    ]
    if hits:  # don't cache empty/failed responses
        await redis_client.set(
            key, orjson.dumps([h.model_dump() for h in hits]), ex=_GEOCODE_CACHE_TTL
        )
    return hits
