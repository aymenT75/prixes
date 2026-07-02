"""Product + PricePoint ORM models — normalised cache of OpenFoodFacts / OpenPrices."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, uuid_pk


class Product(Base, TimestampMixin):
    """Cached/normalised product keyed by barcode (EAN/UPC)."""

    __tablename__ = "products"

    barcode: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    brand: Mapped[str | None] = mapped_column(String(200), nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    quantity: Mapped[str | None] = mapped_column(String(64), nullable=True)

    nutriscore: Mapped[str | None] = mapped_column(String(1), nullable=True)   # a..e
    ecoscore: Mapped[str | None] = mapped_column(String(1), nullable=True)     # a..e
    nova_group: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)  # 1..4
    categories: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Comma-separated FR allergen labels (e.g. "lait, gluten, fruits à coque").
    allergens: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Comma-separated FR diet labels the product SATISFIES (e.g. "végan, bio").
    diets: Mapped[str | None] = mapped_column(Text, nullable=True)

    raw_off: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PricePoint(Base):
    """A single observed price for a product (OpenPrices or user contribution)."""

    __tablename__ = "price_points"

    id: Mapped[uuid.UUID] = uuid_pk()
    barcode: Mapped[str] = mapped_column(ForeignKey("products.barcode"), index=True)
    store: Mapped[str | None] = mapped_column(String(120), nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    source: Mapped[str] = mapped_column(String(16))  # off | op | user
    contributor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
