"""add diets column to products

Revision ID: 0003_diets
Revises: 0002_allergens
Create Date: 2026-06-28
"""
from __future__ import annotations

from alembic import op

revision = "0003_diets"
down_revision = "0002_allergens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent — see 0002 (0001 create_all() may already have added this column).
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS diets TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE products DROP COLUMN IF EXISTS diets")
