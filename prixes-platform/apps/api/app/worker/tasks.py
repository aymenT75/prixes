"""Background tasks: ingest French fuel open data, refresh trending feed."""
from __future__ import annotations

import io
import zipfile
from datetime import UTC, datetime
from typing import Any
from xml.etree import ElementTree as ET

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.http import get_http_client
# Import the full model registry so SQLAlchemy can resolve every ForeignKey
# (e.g. price_alerts -> users/products) when it sorts tables on commit. The
# worker process would otherwise only load a subset of mappers.
from app.core import models as _models  # noqa: F401
from app.domains.alerts import service as alert_service
from app.domains.fuel.models import FuelStation
from app.domains.notifications import service as notify_service
from app.domains.products.ingest import refresh_prices as _refresh_prices

# gov ids: 1=Gazole 2=SP95 3=E85 4=GPLc 5=SP98 6=E10
_FUEL_NAMES = {"1": "gazole", "2": "sp95", "3": "e85", "4": "gplc", "5": "sp98", "6": "e10"}


async def ingest_fuel(_: dict[str, Any]) -> dict[str, int]:
    """Download + parse the national instantaneous fuel-price feed (zipped XML)."""
    resp = await get_http_client().get(settings.fuel_data_url, timeout=60.0)
    resp.raise_for_status()

    raw = resp.content
    if raw[:2] == b"PK":  # zip archive
        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            raw = zf.read(zf.namelist()[0])

    root = ET.fromstring(raw)
    now = datetime.now(UTC)
    count = 0

    async with SessionLocal() as db:
        for pdv in root.findall(".//pdv"):
            try:
                sid = int(pdv.get("id"))
                lat = float(pdv.get("latitude")) / 100000.0
                lon = float(pdv.get("longitude")) / 100000.0
            except (TypeError, ValueError):
                continue

            prices = {
                _FUEL_NAMES.get(p.get("id"), p.get("nom", "")).lower(): float(p.get("valeur"))
                for p in pdv.findall("prix")
                if p.get("valeur")
            }
            address = (pdv.findtext("adresse") or "").strip()
            city = (pdv.findtext("ville") or "").strip()

            stmt = pg_insert(FuelStation).values(
                id=sid,
                lat=lat,
                lon=lon,
                geo=func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326),
                address=address or None,
                city=city or None,
                postal_code=pdv.get("cp"),
                prices=prices,
                updated_at=now,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["id"],
                set_={
                    "lat": lat,
                    "lon": lon,
                    "geo": func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326),
                    "prices": prices,
                    "updated_at": now,
                },
            )
            await db.execute(stmt)
            count += 1
        await db.commit()
    return {"stations": count}


async def evaluate_price_alerts(_: dict[str, Any]) -> dict[str, int]:
    """Check every active price alert against the latest prices, flag matches, and
    push a notification to the owner's devices (in addition to the in-app flag)."""
    async with SessionLocal() as db:
        triggered = await alert_service.evaluate_all(db)
        await db.commit()
        pushed = await notify_service.notify_price_drops(db, triggered) if triggered else 0
        await db.commit()
    return {"triggered": len(triggered), "pushed": pushed}


async def refresh_prices(_: dict[str, Any]) -> dict[str, int]:
    """Scheduled real-price refresh (Open Prices). Runs in the worker so the
    public API never sees the crawl latency (see products/ingest.py)."""
    return await _refresh_prices()
