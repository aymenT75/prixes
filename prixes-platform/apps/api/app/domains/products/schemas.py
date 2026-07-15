"""Product + price schemas (shape mirrors what the old courses tab rendered)."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class PricePointOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    store: str | None
    price: Decimal
    currency: str
    source: str
    location: str | None
    created_at: datetime
    # Per-unit price for fair comparison (e.g. 2.30, "€/L"). None when the
    # product quantity can't be parsed.
    unit_price: Decimal | None = None
    unit_label: str | None = None


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    barcode: str
    name: str | None
    brand: str | None
    image_url: str | None
    quantity: str | None
    nutriscore: str | None
    ecoscore: str | None
    nova_group: int | None
    categories: str | None
    allergens: str | None = None
    diets: str | None = None


class ProductDetail(ProductOut):
    prices: list[PricePointOut] = Field(default_factory=list)
    best_price: Decimal | None = None
    # Best (lowest) per-unit price across all price points + its label.
    best_unit_price: Decimal | None = None
    unit_label: str | None = None


class ProductSearchResult(BaseModel):
    items: list[ProductOut]
    total: int


class PriceContribution(BaseModel):
    store: str = Field(min_length=1, max_length=120)
    # Upper bound catches the typo case (e.g. 850 for €8.50) — a grocery item
    # over €1000 is a data-entry slip, not a real price.
    price: Decimal = Field(gt=0, le=1000)
    currency: str = "EUR"
    location: str | None = None


class PriceContributionOut(BaseModel):
    id: uuid.UUID
    barcode: str
    price: Decimal
    store: str | None


class PriceHistoryPoint(BaseModel):
    day: date
    price: Decimal  # lowest observed price that day


class PriceHistoryOut(BaseModel):
    barcode: str
    points: list[PriceHistoryPoint]
    lowest: Decimal | None = None
    highest: Decimal | None = None


class AlternativeOut(ProductOut):
    """A healthier same-category product suggestion."""
    best_price: Decimal | None = None


class AlternativesOut(BaseModel):
    items: list[AlternativeOut]
