"""drop users.deals_count — the Deals feature was removed entirely

Revision ID: 0009_drop_deals_count
Revises: 0008_pricepoint_index
Create Date: 2026-07-27
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0009_drop_deals_count"
down_revision = "0008_pricepoint_index"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("users", "deals_count")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column("deals_count", sa.Integer(), nullable=False, server_default="0"),
    )
