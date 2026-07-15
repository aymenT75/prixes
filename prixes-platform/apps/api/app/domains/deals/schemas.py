"""Pydantic v2 schemas for deals + votes (validation mirrors old firestore.rules)."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator


class DealCreate(BaseModel):
    title: str = Field(min_length=4, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    store: str | None = Field(default=None, max_length=120)
    category: str | None = Field(default=None, max_length=64)
    price_now: Decimal = Field(gt=0)
    price_before: Decimal = Field(gt=0)
    link: HttpUrl | None = None
    photo_url: str | None = None
    expires_at: datetime | None = None

    @model_validator(mode="after")
    def _check_discount(self) -> DealCreate:
        if self.price_now >= self.price_before:
            raise ValueError("price_now must be lower than price_before")
        return self


class DealAuthor(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    username: str
    initials: str
    reputation: int


class DealOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    title: str
    description: str | None
    store: str | None
    category: str | None
    price_now: Decimal
    price_before: Decimal
    discount_pct: int
    photo_url: str | None
    link: str | None
    votes_up: int
    votes_down: int
    expires_at: datetime | None
    created_at: datetime


class VoteIn(BaseModel):
    value: Literal[1, -1]


class RecognizeIn(BaseModel):
    # Base64-encoded image (no data: prefix) + its media type.
    image: str = Field(min_length=16)
    media_type: Literal["image/jpeg", "image/png", "image/webp"] = "image/jpeg"


class RecognizeOut(BaseModel):
    available: bool  # False when no vision API key is configured
    product_name: str | None = None
    brand: str | None = None


class FeedPage(BaseModel):
    items: list[DealOut]
    next_cursor: int | None
    sort: str
