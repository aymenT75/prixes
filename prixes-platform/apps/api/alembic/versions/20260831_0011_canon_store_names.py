"""fold every spelling of a chain onto one store name

OpenStreetMap names the same chain several ways, and the ingest only folded the
spellings that were listed exactly. So the same retailer arrived as "E.Leclerc"
(517 products), "E. Leclerc" (101) and "Centre Commercial E.Leclerc" (1), and
Intermarché came in three formats.

That was invisible while the app only ranked stores. It stopped being invisible
with the basket splitter, which read them as different shops and answered
"2 magasins : E. Leclerc et E.Leclerc" — the same shop twice, to save 19 cents.

`canon_store_name` fixes new prices; this backfills the ones already stored.

Netto is deliberately left alone: it belongs to Intermarché but is a separate
brand with its own prices, so it stays its own store.

Revision ID: 0011_canon_store_names
Revises: 0010_smart_cart
Create Date: 2026-08-31
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0011_canon_store_names"
down_revision = "0010_smart_cart"
branch_labels = None
depends_on = None

# (canonical name, substring that identifies the chain, case-insensitive).
# Mirrors RETAILER_MATCHERS in products/ingest.py, minus the netto → Intermarché
# rule, which would merge two brands that price differently.
_CHAINS: list[tuple[str, str]] = [
    ("E.Leclerc", "leclerc"),
    ("Intermarché", "intermarch"),
    ("Carrefour", "carrefour"),
    ("Auchan", "auchan"),
    ("Lidl", "lidl"),
    ("Aldi", "aldi"),
    ("Monoprix", "monoprix"),
    ("Franprix", "franprix"),
    ("Casino", "casino"),
    ("Cora", "cora"),
    ("Super U", "super u"),
    ("Super U", "hyper u"),
    ("Super U", "u express"),
    ("Super U", "magasins u"),
]


_UPDATE = sa.text(
    "UPDATE price_points SET store = :canon "
    "WHERE store IS NOT NULL AND store <> :canon "
    "AND lower(store) LIKE :needle "
    "AND lower(store) NOT LIKE '%netto%'"
)


def upgrade() -> None:
    bind = op.get_bind()
    for canon, needle in _CHAINS:
        bind.execute(_UPDATE, {"canon": canon, "needle": f"%{needle}%"})


def downgrade() -> None:
    # The original spellings are not recoverable, and they were never meaningful:
    # they are re-derived from OpenStreetMap on every ingest.
    pass
