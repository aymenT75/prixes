"""drop users.deals_count — the Deals feature was removed entirely

Revision ID: 0009_drop_deals_count
Revises: 0008_pricepoint_index
Create Date: 2026-07-27
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0009_drop_deals_count"
down_revision = "0008_pricepoint_index"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent, same reasoning as 0002/0003/0004: on a database bootstrapped by
    # 0001's create_all() the column exists and this drops it; on a database built
    # purely from this migration history it was never added, so there is nothing
    # to drop. Without this guard, a from-scratch `alembic upgrade head` fails here.
    columns = {c["name"] for c in inspect(op.get_bind()).get_columns("users")}
    if "deals_count" in columns:
        op.drop_column("users", "deals_count")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column("deals_count", sa.Integer(), nullable=False, server_default="0"),
    )
