"""add allergens column to products

Revision ID: 0002_allergens
Revises: 0001_initial
Create Date: 2026-06-28
"""
from __future__ import annotations

from alembic import op

revision = "0002_allergens"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent: 0001 create_all() already builds the full current schema on a
    # fresh DB, so this column may already exist. IF NOT EXISTS keeps a from-scratch
    # `alembic upgrade head` working while still applying on older incremental DBs.
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS allergens TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS allergens")
