"""User ORM model (replaces Firestore `users` collection)."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, uuid_pk


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(64))
    initials: Mapped[str] = mapped_column(String(4))
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # OAuth (Google) — mirrors current Firebase Google sign-in
    oauth_provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    oauth_sub: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

    # Reputation / gamification (from Firestore: rep, totalVotes)
    reputation: Mapped[int] = mapped_column(Integer, default=0)
    votes_received: Mapped[int] = mapped_column(Integer, default=0)

    role: Mapped[str] = mapped_column(String(16), default="user")  # user|moderator|admin
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False)

    # The meal-plan questionnaire (mealplan.schemas.MealPreferences). On the
    # account rather than the device, so the answers follow the user. Null until
    # the questionnaire has been answered once.
    meal_preferences: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    # Premium (billing domain). Paid until this instant; null = never subscribed.
    # Written only by the Stripe webhook, never by the user.
    premium_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # "2026-09" once this month's free weekly menu has been used.
    free_menu_month: Mapped[str | None] = mapped_column(String(7), nullable=True)
