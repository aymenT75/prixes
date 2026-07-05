"""Device ORM model — a registered push-notification target for a user."""
from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, uuid_pk


class Device(Base, TimestampMixin):
    """An FCM/APNs registration token owned by a user. One row per device token;
    the same token can be re-registered (upsert) to move it to the current user."""

    __tablename__ = "devices"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    token: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    platform: Mapped[str] = mapped_column(String(16), default="unknown")  # ios|android|web
