"""The month's budget: French calendar months, and equivalents in shop baskets."""
from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from app.domains.shopping.budget import month_start
from app.domains.shopping.equivalents import Equivalent
from app.domains.shopping.service import PricedLine, _by_store


def test_month_starts_at_midnight_in_france() -> None:
    # 1 Oct 2026, summer time: midnight in Paris is 22:00 UTC on 30 Sept.
    paris_midnight = datetime(2026, 9, 30, 22, tzinfo=UTC)
    assert month_start(datetime(2026, 10, 7, 12, tzinfo=UTC)) == paris_midnight
    # 1 Dec, winter time: 23:00 UTC the day before.
    assert month_start(datetime(2026, 12, 15, tzinfo=UTC)) == datetime(2026, 11, 30, 23, tzinfo=UTC)
    # Just after midnight in Paris on the 1st already counts as the new month.
    assert month_start(datetime(2026, 9, 30, 22, 30, tzinfo=UTC)) == paris_midnight


def test_a_shop_without_the_exact_product_offers_its_equivalent() -> None:
    milk = PricedLine(
        barcode="1",
        quantity=2,
        label="Lait Lactel",
        per_store={"Carrefour": Decimal("1.20")},
        alternatives={"Lidl": Equivalent("9", "Lait demi-écrémé Milbona", Decimal("0.95"))},
    )
    baskets = {b.store: b for b in _by_store([milk])}
    lidl = baskets["Lidl"].items[0]
    assert lidl.label == "Lait demi-écrémé Milbona"
    assert lidl.equivalent_of == "Lait Lactel"
    assert lidl.line_total == Decimal("1.90")
    assert baskets["Carrefour"].items[0].equivalent_of is None


def test_exact_products_rank_before_equivalents() -> None:
    lines = [
        PricedLine(
            "1", 1, "Lait", {"A": Decimal("1")},
            alternatives={"B": Equivalent("8", "Lait B", Decimal("0.5"))},
        ),
        PricedLine("2", 1, "Pain", {"A": Decimal("1"), "B": Decimal("1")}),
    ]
    # Both sell two lines; A sells both exactly, so it comes first despite costing more.
    assert [b.store for b in _by_store(lines)] == ["A", "B"]
