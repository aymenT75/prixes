"""shopping: a list shared with family

Members use the owner's list; an invite code lets them join. Each line records
who added it and who ticked it off.

Revision ID: 0014_shared_list
Revises: 0013_premium
Create Date: 2026-10-07
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

revision = "0014_shared_list"
down_revision = "0013_premium"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent like 0002-0013: on a fresh database 0001 create_all() already
    # builds every table from today's models.
    inspector = inspect(op.get_bind())
    tables = set(inspector.get_table_names())

    columns = {c["name"] for c in inspector.get_columns("shopping_items")}
    for name in ("added_by", "checked_by"):
        if name not in columns:
            op.add_column(
                "shopping_items",
                sa.Column(name, sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
            )

    if "list_members" not in tables:
        op.create_table(
            "list_members",
            sa.Column("member_id", sa.Uuid(), sa.ForeignKey("users.id"), primary_key=True),
            sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_list_members_owner_id", "list_members", ["owner_id"])

    if "list_invites" not in tables:
        op.create_table(
            "list_invites",
            sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), primary_key=True),
            sa.Column("code", sa.String(8), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_list_invites_code", "list_invites", ["code"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_list_invites_code", table_name="list_invites")
    op.drop_table("list_invites")
    op.drop_index("ix_list_members_owner_id", table_name="list_members")
    op.drop_table("list_members")
    op.drop_column("shopping_items", "checked_by")
    op.drop_column("shopping_items", "added_by")
