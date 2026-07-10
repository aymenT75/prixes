"""add analytics_events table

Revision ID: 0007_analytics
Revises: 0006_feedback
Create Date: 2026-07-10
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0007_analytics"
down_revision = "0006_feedback"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent: 0001 create_all() builds this on a fresh DB, so skip if present.
    existing = set(inspect(op.get_bind()).get_table_names())
    if "analytics_events" in existing:
        return

    op.create_table(
        "analytics_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("session_id", sa.String(length=64), nullable=False),
        sa.Column("event", sa.String(length=40), nullable=False),
        sa.Column("path", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_analytics_events_session_id", "analytics_events", ["session_id"])
    op.create_index("ix_analytics_events_event", "analytics_events", ["event"])
    op.create_index("ix_analytics_events_created_at", "analytics_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_analytics_events_created_at", table_name="analytics_events")
    op.drop_index("ix_analytics_events_event", table_name="analytics_events")
    op.drop_index("ix_analytics_events_session_id", table_name="analytics_events")
    op.drop_table("analytics_events")
