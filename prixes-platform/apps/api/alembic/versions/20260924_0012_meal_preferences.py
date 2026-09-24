"""users.meal_preferences: the meal-plan questionnaire, kept on the account

The weekly menu now starts with a short questionnaire (why you came, your
kitchen equipment, the kind of food you want). Its answers are stored on the
user so they follow them from phone to computer.

Revision ID: 0012_meal_preferences
Revises: 0011_canon_store_names
Create Date: 2026-09-24
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "0012_meal_preferences"
down_revision = "0011_canon_store_names"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent like 0002-0011: on a fresh database 0001 create_all() already
    # builds users from today's model, column included.
    columns = {c["name"] for c in inspect(op.get_bind()).get_columns("users")}
    if "meal_preferences" not in columns:
        op.add_column("users", sa.Column("meal_preferences", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "meal_preferences")
