"""initial schema (extensions + all tables)

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-27
"""
from __future__ import annotations

from alembic import op

from app.core.models import Base

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Required Postgres extensions (geo + trigram search).
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    # Create every table from the SQLAlchemy metadata. GeoAlchemy2 event hooks
    # also create the GiST spatial index on fuel_stations.geo.
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
