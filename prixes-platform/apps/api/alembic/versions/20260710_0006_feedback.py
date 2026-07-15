"""add feedback table

Revision ID: 0006_feedback
Revises: 0005_devices
Create Date: 2026-07-10
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision = "0006_feedback"
down_revision = "0005_devices"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent: 0001 create_all() builds this table on a fresh DB, so skip if it
    # already exists (keeps a from-scratch `alembic upgrade head` working).
    existing = set(inspect(op.get_bind()).get_table_names())
    if "feedback" in existing:
        return

    op.create_table(
        "feedback",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("rating", sa.SmallInteger(), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("page", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_feedback_user_id", "feedback", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_feedback_user_id", table_name="feedback")
    op.drop_table("feedback")
