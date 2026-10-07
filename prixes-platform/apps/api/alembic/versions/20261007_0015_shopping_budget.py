"""shopping: finished shops and the monthly budget

Revision ID: 0015_shopping_budget
Revises: 0014_shared_list
Create Date: 2026-10-07
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision = "0015_shopping_budget"
down_revision = "0014_shared_list"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent like 0002-0014: on a fresh database 0001 create_all() already
    # builds every table from today's models.
    tables = set(inspect(op.get_bind()).get_table_names())

    if "shopping_trips" not in tables:
        op.create_table(
            "shopping_trips",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("store", sa.String(120), nullable=False),
            sa.Column("total", sa.Numeric(10, 2), nullable=False),
            sa.Column("saving", sa.Numeric(10, 2), nullable=True),
            sa.Column("items", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_shopping_trips_owner_id", "shopping_trips", ["owner_id"])

    if "shopping_budgets" not in tables:
        op.create_table(
            "shopping_budgets",
            sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), primary_key=True),
            sa.Column("monthly", sa.Numeric(10, 2), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )


def downgrade() -> None:
    op.drop_table("shopping_budgets")
    op.drop_index("ix_shopping_trips_owner_id", table_name="shopping_trips")
    op.drop_table("shopping_trips")
