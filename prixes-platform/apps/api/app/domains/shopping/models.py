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

    # ── Added in 0014, for a list shared with family ──
    # Who put the line on the list and who ticked it off. Null for lines from
    # before sharing existed, and for a list nobody shares.
    added_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    checked_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    @property
    def label(self) -> str:
        """Best available display name, never empty."""
        return self.name or self.free_text or self.barcode or "?"


class ListMember(Base, TimestampMixin):
    """Someone who uses another person's list instead of their own.

    One shared list per person: a member's own lines are set aside (not deleted)
    and come back if they leave.
    """

    __tablename__ = "list_members"

    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)


class ListInvite(Base, TimestampMixin):
    """The code that lets someone join a list. One per owner, replaced on demand."""

    __tablename__ = "list_invites"

    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    code: Mapped[str] = mapped_column(String(8), unique=True, index=True)


class ShoppingTrip(Base, TimestampMixin):
    """A finished shop: where, what it cost, what it saved.

    Kept per list (the owner's id), so a family sharing a list shares its budget.
    """

    __tablename__ = "shopping_trips"

    id: Mapped[uuid.UUID] = uuid_pk()
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    # Who did this shop (the owner, or a family member on the shared list).
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    store: Mapped[str] = mapped_column(String(120))
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    # Against the dearest shop nearby for the same products; null when unknown.
    saving: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    items: Mapped[int] = mapped_column(Integer, default=0)


class ShoppingBudget(Base, TimestampMixin):
    """The monthly shopping budget of a list (shared by the family on it)."""

    __tablename__ = "shopping_budgets"

    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    monthly: Mapped[Decimal] = mapped_column(Numeric(10, 2))
