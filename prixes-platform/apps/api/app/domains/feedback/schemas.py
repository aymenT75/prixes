"""Feedback request/response schemas."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FeedbackIn(BaseModel):
    message: str = Field(min_length=3, max_length=4000)
    rating: int | None = Field(default=None, ge=1, le=5)
    # Plain string (light cap) to avoid the email-validator dependency; it's optional
    # contact info, not an auth identity.
    email: str | None = Field(default=None, max_length=255)
    page: str | None = Field(default=None, max_length=200)


class FeedbackOut(BaseModel):
    id: str
    ok: bool = True


class FeedbackItem(BaseModel):
    """One feedback row (admin view)."""

    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    rating: int | None
    message: str
    email: str | None
    page: str | None
    user_id: uuid.UUID | None
    created_at: datetime


class FeedbackList(BaseModel):
    items: list[FeedbackItem]
    total: int
    average_rating: float | None
    # How many submissions carry each 1–5 rating, for a quick distribution bar.
    rating_counts: dict[int, int]
