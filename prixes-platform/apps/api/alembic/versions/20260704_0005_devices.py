"""add devices table for push notifications

Revision ID: 0005_devices
Revises: 0004_shopping_alerts
Create Date: 2026-07-04
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0005_devices"
down_revision = "0004_shopping_alerts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent: 0001 create_all() builds this table on a fresh DB, so skip if it
    # already exists (keeps a from-scratch `alembic upgrade head` working).
    existing = set(inspect(op.get_bind()).get_table_names())
    if "devices" in existing:
        return

    op.create_table(
        "devices",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token", sa.String(length=255), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False, server_default="unknown"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("token", name="uq_devices_token"),
    )
    op.create_index("ix_devices_user_id", "devices", ["user_id"])
    op.create_index("ix_devices_token", "devices", ["token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_devices_token", table_name="devices")
    op.drop_index("ix_devices_user_id", table_name="devices")
    op.drop_table("devices")
