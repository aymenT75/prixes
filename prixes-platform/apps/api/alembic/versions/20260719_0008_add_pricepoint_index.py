"""add index on price_points.created_at for price_history queries

Revision ID: 0008_pricepoint_index
Revises: 0007_analytics
Create Date: 2026-07-19
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import inspect


revision = "0008_pricepoint_index"
down_revision = "0007_analytics"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent: check if index already exists before creating
    inspector = inspect(op.get_bind())
    # get_indexes() yields dicts, not objects — ix["name"], never ix.name.
    indexes = {ix["name"] for ix in inspector.get_indexes("price_points")}

    if "ix_price_points_created_at" not in indexes:
        op.create_index(
            "ix_price_points_created_at",
            "price_points",
            ["created_at"],
            postgresql_using="btree",
        )


def downgrade() -> None:
    op.drop_index("ix_price_points_created_at", table_name="price_points")
