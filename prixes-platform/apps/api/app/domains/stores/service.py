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

The main Overpass instance regularly times out or rate-limits: a request then
tries the public mirrors, and when all of them fail it serves the last list
fetched for that spot (kept a week), flagged `stale`. Only when there is nothing
at all does it answer "unavailable" — not "no store here", which is a lie a
blind user has no way to check.
"""
from __future__ import annotations

import logging
from math import asin, cos, radians, sin, sqrt
from typing import Any, cast

import orjson

from app.core.http import get_http_client
from app.core.redis import redis_client
from app.domains.stores.schemas import GeocodeHit, StoreOut

# Tried in order; the first answer wins. The main instance gets the query's own
# 20 s budget (it is usually the one that answers, just slowly at peak); the
# mirrors, often down themselves, get a short one so the user is not kept waiting.
OVERPASS_URLS = (
    ("https://overpass-api.de/api/interpreter", 22.0),
    ("https://maps.mail.ru/osm/tools/overpass/api/interpreter", 8.0),
    ("https://overpass.private.coffee/api/interpreter", 8.0),
)
logger = logging.getLogger(__name__)
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

# Address lookups don't change; cache aggressively to spare the (free, shared)
# Nominatim usage-policy-limited endpoint.
_GEOCODE_CACHE_TTL = 7 * 24 * 3600

# shop tags we treat as "supermarket" for this feature.
_SHOP_TYPES = ("supermarket", "convenience", "grocery")

# Supermarket POIs are stable; cache the raw list for 6h to spare the upstream.
_CACHE_TTL = 6 * 3600
# The fallback copy, served only when every Overpass instance fails.
_STALE_TTL = 7 * 24 * 3600


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


async def _fetch_pois(lat: float, lon: float, radius_km: float) -> list[dict[str, Any]] | None:
    """Raw supermarket POIs (no distance) from Overpass; None when every instance failed."""
    query = _build_query(lat, lon, int(radius_km * 1000))
    elements: list[dict[str, Any]] | None = None
    for url, timeout in OVERPASS_URLS:
        try:
            resp = await get_http_client().post(url, data={"data": query}, timeout=timeout)
            resp.raise_for_status()
            elements = resp.json().get("elements", [])
            break
        except Exception as exc:  # noqa: BLE001 — never propagate upstream failures
            logger.warning("overpass %s failed: %s", url, type(exc).__name__)
    if elements is None:
        return None

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


async def _cached_pois(
    lat: float, lon: float, radius_km: float
) -> tuple[list[dict[str, Any]], str]:
    """Cache-aside on a ~110 m grid. Only successful (non-empty) fetches are cached.

    Returns the POIs and where they came from: "live", "stale" (the week-old
    copy, every upstream failed) or "unavailable" (nothing to serve at all).
    """
    key = f"stores:osm:{round(lat, 3)}:{round(lon, 3)}:{radius_km}"
    cached = await redis_client.get(key)
    if cached is not None:
        return cast("list[dict[str, Any]]", orjson.loads(cached)), "live"
    pois = await _fetch_pois(lat, lon, radius_km)
    if pois:  # don't cache empty/failed responses (avoids poisoning during rate-limits)
        await redis_client.set(key, orjson.dumps(pois), ex=_CACHE_TTL)
        await redis_client.set(f"{key}:stale", orjson.dumps(pois), ex=_STALE_TTL)
        return pois, "live"
    if pois is not None:
        return [], "live"  # Overpass answered: there really is nothing here
    stale = await redis_client.get(f"{key}:stale")
    if stale is not None:
        return cast("list[dict[str, Any]]", orjson.loads(stale)), "stale"
    return [], "unavailable"


async def nearby(
    lat: float, lon: float, radius_km: float = 5.0, limit: int = 20
) -> tuple[list[StoreOut], str]:
    """Supermarkets near (lat, lon), nearest first, and their source (see _cached_pois)."""
    pois, source = await _cached_pois(lat, lon, radius_km)
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
    return stores[:limit], source


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
