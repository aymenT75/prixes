"""Fuel station ORM model — geo-indexed cache of French `prix-carburants` open data."""
from __future__ import annotations

from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import BigInteger, DateTime, Float, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class FuelStation(Base):
    __tablename__ = "fuel_stations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)  # gov station id
    brand: Mapped[str | None] = mapped_column(String(120), nullable=True)
    address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(10), nullable=True, index=True)

    # Plain coords for trivial reads...
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    # ...plus a GiST-indexed geography point for ST_DWithin "nearby" queries.
    geo: Mapped[str] = mapped_column(Geography(geometry_type="POINT", srid=4326))

    # {"gazole": 1.79, "sp95": 1.85, "sp98": 1.92, "e85": 0.89, "gplc": 0.95}
    prices: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
