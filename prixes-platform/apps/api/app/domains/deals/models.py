"""Deal + Vote ORM models (replace Firestore `deals` and `votes` collections)."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, uuid_pk


class Deal(Base, TimestampMixin):
    __tablename__ = "deals"
    __table_args__ = (
        CheckConstraint("price_now > 0 AND price_before > 0", name="ck_prices_positive"),
        CheckConstraint("price_now < price_before", name="ck_discount"),
        Index("ix_deals_score_active", "score", postgresql_where="status = 'active'"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)

    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    store: Mapped[str | None] = mapped_column(String(120), nullable=True)
    category: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    price_now: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    price_before: Mapped[Decimal] = mapped_column(Numeric(10, 2))

    photo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    link: Mapped[str | None] = mapped_column(String(512), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    status: Mapped[str] = mapped_column(String(16), default="active")  # active|expired|removed
    votes_up: Mapped[int] = mapped_column(Integer, default=0)
    votes_down: Mapped[int] = mapped_column(Integer, default=0)
    score: Mapped[float] = mapped_column(Numeric(20, 6), default=0)

    @property
    def discount_pct(self) -> int:
        if self.price_before and self.price_before > 0:
            return round(float((self.price_before - self.price_now) / self.price_before) * 100)
        return 0


class Vote(Base):
    """One vote per (user, deal) — PK enforces dedupe (ARCHITECTURE.md §9)."""

    __tablename__ = "votes"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    deal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("deals.id", ondelete="CASCADE"), primary_key=True
    )
    value: Mapped[int] = mapped_column(SmallInteger)  # +1 / -1
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Report(Base, TimestampMixin):
    """A user report flagging a deal for moderation."""

    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = uuid_pk()
    deal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("deals.id", ondelete="CASCADE"), index=True
    )
    reporter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[str] = mapped_column(String(64))  # spam | expired | wrong_price | abuse | other
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="open")  # open | resolved | dismissed
