"""Analytics event ORM model — anonymous usage signal, no personal data."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, uuid_pk


class AnalyticsEvent(Base):
    """A single anonymous product-usage event (page view or key action).

    `session_id` is a random client-generated id kept in localStorage — it lets us
    count distinct sessions without cookies or identifying the person.
    """

    __tablename__ = "analytics_events"

    id: Mapped[uuid.UUID] = uuid_pk()
    session_id: Mapped[str] = mapped_column(String(64), index=True)
    event: Mapped[str] = mapped_column(String(40), index=True)  # pageview | search | ...
    path: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
