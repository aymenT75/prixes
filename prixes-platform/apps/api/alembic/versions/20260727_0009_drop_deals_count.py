"""drop users.deals_count — the Deals feature was removed entirely

Revision ID: 0009_drop_deals_count
Revises: 0008_pricepoint_index
Create Date: 2026-07-27
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision = "0009_drop_deals_count"
down_revision = "0008_pricepoint_index"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent, like 0002-0008: on a fresh database 0001 create_all() builds the
    # users table from today's model, which never had deals_count, so the DROP
    # failed and every install from scratch (CI included) stopped here.
    columns = {c["name"] for c in inspect(op.get_bind()).get_columns("users")}
    if "deals_count" in columns:
        op.drop_column("users", "deals_count")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column("deals_count", sa.Integer(), nullable=False, server_default="0"),
    )
