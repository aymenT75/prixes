"""Shopping-list ORM model — one row per thing a user wants to buy.

A row is either a catalog product (``barcode`` set, prices available) or a plain
label the Smart Assistant produced that nothing in the catalog matched
(``free_text`` set). The CHECK constraint added in migration 0010 guarantees one
of the two is present.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, TimestampMixin, uuid_pk


class ShoppingItem(Base, TimestampMixin):
    """A product on a user's shopping list (deduplicated per user+barcode)."""

    __tablename__ = "shopping_items"
    __table_args__ = (
        UniqueConstraint("user_id", "barcode", name="uq_shopping_user_barcode"),
        CheckConstraint(
            "barcode IS NOT NULL OR free_text IS NOT NULL",
            name="ck_shopping_barcode_or_text",
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    # Null when the line has no catalog match — see free_text.
    barcode: Mapped[str | None] = mapped_column(
        ForeignKey("products.barcode"), index=True, nullable=True
    )
    # How many units to buy. This is what the optimizer multiplies by the price.
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    checked: Mapped[bool] = mapped_column(Boolean, default=False)
    # Denormalised label so the list renders even before the product is cached.
    name: Mapped[str | None] = mapped_column(String(300), nullable=True)

    # ── Added in 0010, for lines that came from a recipe or the assistant ──
    # Label for an item the catalog doesn't have ("fromage à raclette").
    free_text: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # The recipe quantity, shown to the user: 1.5 + "kg". Deliberately NOT used
    # in price arithmetic — a 400 g pack price times 1.5 means nothing.
    amount: Mapped[Decimal | None] = mapped_column(Numeric(9, 3), nullable=True)
    unit: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # manual | ai | recipe | mealplan — drives the badge in the UI and lets us
    # measure whether the assistant's suggestions actually get bought.
    source: Mapped[str] = mapped_column(String(16), default="manual", server_default="manual")

    @property
    def label(self) -> str:
        """Best available display name, never empty."""
        return self.name or self.free_text or self.barcode or "?"
