"""Shopping-list ORM model — one row per product a user wants to buy."""
from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, uuid_pk


class ShoppingItem(Base, TimestampMixin):
    """A product on a user's shopping list (deduplicated per user+barcode)."""

    __tablename__ = "shopping_items"
    __table_args__ = (UniqueConstraint("user_id", "barcode", name="uq_shopping_user_barcode"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    barcode: Mapped[str] = mapped_column(ForeignKey("products.barcode"), index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    checked: Mapped[bool] = mapped_column(Boolean, default=False)
    # Denormalised label so the list renders even before the product is cached.
    name: Mapped[str | None] = mapped_column(String(300), nullable=True)
