"""add shopping_items and price_alerts tables

Revision ID: 0004_shopping_alerts
Revises: 0003_diets
Create Date: 2026-07-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0004_shopping_alerts"
down_revision = "0003_diets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent: 0001 create_all() already builds these tables on a fresh DB, so
    # skip any that exist (keeps a from-scratch `alembic upgrade head` working).
    existing = set(inspect(op.get_bind()).get_table_names())

    if "shopping_items" not in existing:
        _create_shopping_items()
    if "price_alerts" not in existing:
        _create_price_alerts()


def _create_shopping_items() -> None:
    op.create_table(
        "shopping_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("barcode", sa.String(length=32), sa.ForeignKey("products.barcode"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("checked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("name", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "barcode", name="uq_shopping_user_barcode"),
    )
    op.create_index("ix_shopping_items_user_id", "shopping_items", ["user_id"])
    op.create_index("ix_shopping_items_barcode", "shopping_items", ["barcode"])


def _create_price_alerts() -> None:
    op.create_table(
        "price_alerts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("barcode", sa.String(length=32), sa.ForeignKey("products.barcode"), nullable=False),
        sa.Column("target_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("baseline_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("triggered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("triggered_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("acknowledged", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "barcode", name="uq_alert_user_barcode"),
    )
    op.create_index("ix_price_alerts_user_id", "price_alerts", ["user_id"])
    op.create_index("ix_price_alerts_barcode", "price_alerts", ["barcode"])


def downgrade() -> None:
    op.drop_index("ix_price_alerts_barcode", table_name="price_alerts")
    op.drop_index("ix_price_alerts_user_id", table_name="price_alerts")
    op.drop_table("price_alerts")
    op.drop_index("ix_shopping_items_barcode", table_name="shopping_items")
    op.drop_index("ix_shopping_items_user_id", table_name="shopping_items")
    op.drop_table("shopping_items")
