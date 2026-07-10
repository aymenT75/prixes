"""Feedback ORM model — a message (and optional rating) left by a user or visitor."""
from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, uuid_pk


class Feedback(Base, TimestampMixin):
    """One feedback submission. Anonymous visitors are allowed (user_id nullable);
    an optional email lets them be contacted back."""

    __tablename__ = "feedback"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    rating: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)  # 1..5
    message: Mapped[str] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # The screen the feedback was sent from (e.g. "/courses/detail"), for context.
    page: Mapped[str | None] = mapped_column(String(200), nullable=True)
