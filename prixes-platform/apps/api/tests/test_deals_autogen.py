"""Auto-generated deals candidate selection — pure function (no DB), covering
the plausibility/ranking rules that keep the Deals tab populated from real
price spreads (SIT audit follow-up: "il n'y a pas de deal")."""
from __future__ import annotations

from decimal import Decimal

from app.domains.deals.autogen import MAX_AUTO_DEALS, select_candidates


def test_rejects_single_store_products() -> None:
    rows = [("111", Decimal("1.00"), Decimal("1.00"), 1)]
    assert select_candidates(rows) == []


def test_rejects_below_min_discount() -> None:
    # 5% spread — below the MIN_DISCOUNT_PCT floor, not worth surfacing as a "deal".
    rows = [("111", Decimal("1.90"), Decimal("2.00"), 3)]
    assert select_candidates(rows) == []


def test_rejects_implausible_mega_discount() -> None:
    # 90% spread almost certainly means a data error (decimal slip, wrong unit),
    # not a real deal — must never reach users as if it were.
    rows = [("111", Decimal("0.20"), Decimal("2.00"), 2)]
    assert select_candidates(rows) == []


def test_accepts_and_ranks_by_discount_desc() -> None:
    rows = [
        ("low", Decimal("1.80"), Decimal("2.00"), 2),  # 10%
        ("high", Decimal("1.00"), Decimal("2.00"), 2),  # 50%
        ("mid", Decimal("1.50"), Decimal("2.00"), 3),  # 25%
    ]
    picked = select_candidates(rows)
    assert [c[0] for c in picked] == ["high", "mid", "low"]


def test_caps_at_max_deals() -> None:
    rows = [(str(i), Decimal("1.00"), Decimal("2.00"), 2) for i in range(MAX_AUTO_DEALS + 5)]
    assert len(select_candidates(rows)) == MAX_AUTO_DEALS


def test_ignores_zero_or_inverted_prices() -> None:
    rows = [
        ("zero", Decimal("0.00"), Decimal("2.00"), 2),
        ("inverted", Decimal("2.00"), Decimal("1.00"), 2),
    ]
    assert select_candidates(rows) == []
