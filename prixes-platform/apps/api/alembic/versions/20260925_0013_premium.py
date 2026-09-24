"""users: Premium subscription (Stripe) and the monthly free menu

Four features call a paid model (weekly menu, text-to-cart assistant, photo
recognition, natural voice); they become Premium. The account records until when
it is paid, its Stripe customer, and the month its one free menu was used.

Revision ID: 0013_premium
Revises: 0012_meal_preferences
Create Date: 2026-09-25
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision = "0013_premium"
down_revision = "0012_meal_preferences"
branch_labels = None
depends_on = None

_COLUMNS = {
    "premium_until": sa.Column("premium_until", sa.DateTime(timezone=True), nullable=True),
    "stripe_customer_id": sa.Column("stripe_customer_id", sa.String(64), nullable=True),
    "free_menu_month": sa.Column("free_menu_month", sa.String(7), nullable=True),
}


def upgrade() -> None:
    # Idempotent like 0002-0012: on a fresh database 0001 create_all() already
    # builds users from today's model, these columns included.
    inspector = inspect(op.get_bind())
    existing = {c["name"] for c in inspector.get_columns("users")}
    for name, column in _COLUMNS.items():
        if name not in existing:
            op.add_column("users", column)
    indexes = {i["name"] for i in inspector.get_indexes("users")}
    if "ix_users_stripe_customer_id" not in indexes:
        op.create_index("ix_users_stripe_customer_id", "users", ["stripe_customer_id"])


def downgrade() -> None:
    op.drop_index("ix_users_stripe_customer_id", table_name="users")
    for name in _COLUMNS:
        op.drop_column("users", name)
