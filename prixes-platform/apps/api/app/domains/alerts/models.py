"""Price-alert ORM model — notify a user when a product drops in price."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, uuid_pk


class PriceAlert(Base, TimestampMixin):
    """A watch on a product. Triggers when best price <= target_price
    (or, when target_price is NULL, on any new all-time low)."""

    __tablename__ = "price_alerts"
    __table_args__ = (UniqueConstraint("user_id", "barcode", name="uq_alert_user_barcode"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    barcode: Mapped[str] = mapped_column(ForeignKey("products.barcode"), index=True)

    target_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Best price recorded at creation / last evaluation — used to detect new lows.
    baseline_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)

    # Populated by the worker when the condition is met (in-app notification).
    triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    triggered_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
