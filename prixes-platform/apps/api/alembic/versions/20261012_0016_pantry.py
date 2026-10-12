"""shopping: the cupboard ("Je l'ai déjà")

Revision ID: 0016_pantry
Revises: 0015_shopping_budget
Create Date: 2026-10-12
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision = "0016_pantry"
down_revision = "0015_shopping_budget"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent like 0002-0015: on a fresh database 0001 create_all() already
    # builds every table from today's models.
    if "pantry_items" in set(inspect(op.get_bind()).get_table_names()):
        return
    op.create_table(
        "pantry_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("barcode", sa.String(32), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("avoided", sa.Numeric(10, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_pantry_items_owner_id", "pantry_items", ["owner_id"])


def downgrade() -> None:
    op.drop_index("ix_pantry_items_owner_id", table_name="pantry_items")
    op.drop_table("pantry_items")
