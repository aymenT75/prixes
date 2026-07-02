"""Price-alert schemas."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class AlertIn(BaseModel):
    barcode: str = Field(min_length=4, max_length=32)
    # None → alert on any new all-time low. Otherwise alert when best <= target.
    target_price: Decimal | None = Field(default=None, gt=0)


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    barcode: str
    target_price: Decimal | None
    active: bool
    baseline_price: Decimal | None
    triggered_at: datetime | None
    triggered_price: Decimal | None
    acknowledged: bool
    # Enriched for display.
    name: str | None = None
    image_url: str | None = None
    current_best: Decimal | None = None


class AlertListOut(BaseModel):
    items: list[AlertOut]
    total: int
