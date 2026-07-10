"""Feedback request/response schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field


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
