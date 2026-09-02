"""shopping items: free-text lines, recipe amounts, origin

The Smart Assistant produces lines like "fromage à raclette, 1,5 kg" that have no
barcode and no catalog match. Before this migration they simply could not be
stored: `barcode` was NOT NULL and FK'd to products.

Two things change.

1. `barcode` becomes nullable, with a CHECK that a row carries either a barcode
   or a free-text label — never neither.
2. `amount` + `unit` hold the *recipe* quantity ("1,5 kg"), separate from
   `quantity`, which stays the number of packs to buy and is what the basket
   optimizer multiplies by the price. Multiplying a 400 g pack price by 1.5 would
   produce a total that looks credible and is wrong.

Revision ID: 0010_smart_cart
Revises: 0009_drop_deals_count
Create Date: 2026-08-30
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision = "0010_smart_cart"
down_revision = "0009_drop_deals_count"
branch_labels = None
depends_on = None

_NEW_COLUMNS = {
    "free_text": sa.Column("free_text", sa.String(length=200), nullable=True),
    "amount": sa.Column("amount", sa.Numeric(9, 3), nullable=True),
    "unit": sa.Column("unit", sa.String(length=16), nullable=True),
    "source": sa.Column(
        "source", sa.String(length=16), nullable=False, server_default="manual"
    ),
}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = {c["name"] for c in inspector.get_columns("shopping_items")}

    for name, column in _NEW_COLUMNS.items():
        if name not in existing:
            op.add_column("shopping_items", column)

    op.alter_column("shopping_items", "barcode", existing_type=sa.String(32), nullable=True)

    # A row must identify *something*.
    constraints = {c["name"] for c in inspector.get_check_constraints("shopping_items")}
    if "ck_shopping_barcode_or_text" not in constraints:
        op.create_check_constraint(
            "ck_shopping_barcode_or_text",
            "shopping_items",
            "barcode IS NOT NULL OR free_text IS NOT NULL",
        )

    # uq_shopping_user_barcode still guards catalog rows: Postgres treats NULLs as
    # distinct, so it never fires on free-text lines. Those need their own guard,
    # case-insensitive, or "Tomates" and "tomates" both land on the list.
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_shopping_user_freetext "
        "ON shopping_items (user_id, lower(free_text)) WHERE barcode IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_shopping_user_freetext")
    op.drop_constraint("ck_shopping_barcode_or_text", "shopping_items", type_="check")
    # Rows without a barcode cannot survive the NOT NULL that comes back.
    op.execute("DELETE FROM shopping_items WHERE barcode IS NULL")
    op.alter_column("shopping_items", "barcode", existing_type=sa.String(32), nullable=False)
    for name in _NEW_COLUMNS:
        op.drop_column("shopping_items", name)
