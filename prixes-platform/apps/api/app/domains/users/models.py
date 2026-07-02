"""User ORM model (replaces Firestore `users` collection)."""
from __future__ import annotations

import uuid

from sqlalchemy import Boolean, Integer, String
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

    # Reputation / gamification (from Firestore: rep, dealsCount, totalVotes)
    reputation: Mapped[int] = mapped_column(Integer, default=0)
    deals_count: Mapped[int] = mapped_column(Integer, default=0)
    votes_received: Mapped[int] = mapped_column(Integer, default=0)

    role: Mapped[str] = mapped_column(String(16), default="user")  # user|moderator|admin
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False)
