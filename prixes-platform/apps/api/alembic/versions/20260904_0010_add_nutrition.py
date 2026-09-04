"""add per-100g nutrition columns to products

Revision ID: 0010_nutrition
Revises: 0009_drop_deals_count
Create Date: 2026-09-04
"""
from __future__ import annotations

from alembic import op

revision = "0010_nutrition"
down_revision = "0009_drop_deals_count"
branch_labels = None
depends_on = None

# Numeric(9,3): exact storage (these feed the health score), room for kcal and
# for gram values down to the milligram.
_NUMERIC_COLUMNS = (
    "energy_kcal_100g",
    "proteins_100g",
    "carbohydrates_100g",
    "sugars_100g",
    "fiber_100g",
    "fat_100g",
    "saturated_fat_100g",
    "salt_100g",
    "fruits_vegetables_nuts_100g",
)


def upgrade() -> None:
    # Idempotent — see 0002/0003: 0001's create_all() may already have added these
    # on a from-scratch database, so `alembic upgrade head` has to stay runnable.
    for column in _NUMERIC_COLUMNS:
        op.execute(f"ALTER TABLE products ADD COLUMN IF NOT EXISTS {column} NUMERIC(9, 3)")
    op.execute("ALTER TABLE products ADD COLUMN IF NOT EXISTS serving_size VARCHAR(64)")
    # Left NULL on purpose for existing rows: NULL means "never looked", which is
    # what makes get_product() refresh them once and backfill their nutrition.
    op.execute(
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS "
        "nutrition_checked_at TIMESTAMP WITH TIME ZONE"
    )


def downgrade() -> None:
    for column in (*_NUMERIC_COLUMNS, "serving_size", "nutrition_checked_at"):
        op.execute(f"ALTER TABLE products DROP COLUMN IF EXISTS {column}")
