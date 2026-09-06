"""Splitting a basket across stores — what goes in which trolley.

The rules that matter here are not about arithmetic but about what makes a plan
useful: a basket you cannot fill is not cheaper, a second stop has to earn its
place, and every line must land in exactly one basket at a price we actually
know.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from app.domains.shopping.service import (
    PricedLine,
    _allocate,
    _evaluate,
    _merge_by_barcode,
    _rank,
)


def line(label: str, quantity: int = 1, **prices: float) -> PricedLine:
    return PricedLine(
        barcode=label,
        quantity=quantity,
        label=label,
        per_store={store: Decimal(str(p)) for store, p in prices.items()},
    )


# ── Assignment ───────────────────────────────────────────────────────────────
def test_each_line_goes_to_its_cheapest_of_the_chosen_stores() -> None:
    lines = [
        line("pâtes", Leclerc=1.20, Lidl=0.95),
        line("café", Leclerc=3.50, Lidl=4.10),
    ]
    option = _allocate(lines, ("Leclerc", "Lidl"))
    where = {i.label: b.store for b in option.baskets for i in b.items}
    assert where == {"pâtes": "Lidl", "café": "Leclerc"}
    assert option.total == Decimal("4.45")


def test_quantity_multiplies_the_line_but_not_the_unit_price() -> None:
    option = _allocate([line("yaourts", 3, Lidl=0.80)], ("Lidl",))
    item = option.baskets[0].items[0]
    assert item.unit_price == Decimal("0.80")
    assert item.line_total == Decimal("2.40")
    assert option.total == Decimal("2.40")


def test_subtotals_add_up_to_the_total() -> None:
    lines = [
        line("pâtes", Leclerc=1.20, Lidl=0.95),
        line("café", 2, Leclerc=3.50, Lidl=4.10),
        line("beurre", Leclerc=2.30),
    ]
    option = _allocate(lines, ("Leclerc", "Lidl"))
    assert sum((b.subtotal for b in option.baskets), Decimal(0)) == option.total


def test_a_store_that_wins_nothing_is_not_listed() -> None:
    """Otherwise the plan sends you to a shop for an empty trolley."""
    lines = [line("pâtes", Leclerc=1.20, Lidl=1.90), line("café", Leclerc=3.50, Lidl=4.10)]
    option = _allocate(lines, ("Leclerc", "Lidl"))
    assert option.stores == ["Leclerc"]
    assert len(option.baskets) == 1


def test_equal_prices_do_not_split_the_basket() -> None:
    """A tie must fall to the first store, not scatter the shop for no gain."""
    lines = [line("pâtes", Leclerc=1.20, Lidl=1.20), line("café", Leclerc=3.50, Lidl=3.50)]
    option = _allocate(lines, ("Leclerc", "Lidl"))
    assert option.stores == ["Leclerc"]


def test_lines_no_chosen_store_sells_are_reported_not_dropped() -> None:
    lines = [line("pâtes", Leclerc=1.20), line("wasabi", Monoprix=4.90)]
    option = _allocate(lines, ("Leclerc",))
    assert option.missing == ["wasabi"]
    assert option.items_covered == 1
    assert option.items_total == 2
    # The unreachable line must not be silently paid for.
    assert option.total == Decimal("1.20")


def test_baskets_are_ordered_by_weight() -> None:
    """The big shop first: that is the trip you plan around."""
    lines = [
        line("café", Leclerc=3.50, Lidl=9.00),
        line("beurre", Leclerc=2.30, Lidl=9.00),
        line("pâtes", Leclerc=9.00, Lidl=0.95),
    ]
    option = _allocate(lines, ("Leclerc", "Lidl"))
    assert [b.store for b in option.baskets] == ["Leclerc", "Lidl"]


# ── Ranking ──────────────────────────────────────────────────────────────────
def test_coverage_outranks_price() -> None:
    """A basket you cannot fill is always cheaper — that must not win."""
    lines = [line("pâtes", Leclerc=1.20, Lidl=0.95), line("café", Leclerc=3.50)]
    full = _rank(*_evaluate(lines, ("Leclerc",)))     # 2 items, 4.70
    partial = _rank(*_evaluate(lines, ("Lidl",)))     # 1 item, 0.95
    assert full < partial


def test_between_equal_coverage_the_cheaper_wins() -> None:
    lines = [line("pâtes", Leclerc=1.20, Lidl=0.95)]
    assert _rank(*_evaluate(lines, ("Lidl",))) < _rank(*_evaluate(lines, ("Leclerc",)))


@pytest.mark.parametrize(
    ("stores", "covered", "total"),
    [
        (("Leclerc",), 2, Decimal("4.70")),
        (("Lidl",), 1, Decimal("0.95")),
        (("Leclerc", "Lidl"), 2, Decimal("4.45")),
    ],
)
def test_evaluate_counts_coverage_and_cost(
    stores: tuple[str, ...], covered: int, total: Decimal
) -> None:
    lines = [line("pâtes", Leclerc=1.20, Lidl=0.95), line("café", Leclerc=3.50)]
    assert _evaluate(lines, stores) == (covered, total)


def test_an_empty_basket_costs_nothing() -> None:
    assert _evaluate([], ("Leclerc",)) == (0, Decimal(0))


# ── Comparing plans that buy different things ────────────────────────────────
def _options(lines: list[PricedLine], combos: list[tuple[str, ...]]) -> list:
    """Build the option list the way split_lines does, then apply its comparison."""
    from app.domains.shopping.service import _allocate

    options = [_allocate(lines, c) for c in combos]
    single = next(o for o in options if len(o.stores) == 1)
    for option in options:
        if option is single:
            continue
        option.extra_items = option.items_covered - single.items_covered
        if option.extra_items == 0:
            option.saving_vs_single = single.total - option.total
    return options


def test_a_second_store_that_adds_items_is_not_quoted_as_a_saving() -> None:
    """The bug this guards: Carrefour alone covered 5 items for 15,88 €, Carrefour
    plus Franprix covered all 8 for 24,01 €, and the screen offered to "save"
    −8,13 €. The extra stop costs more because it buys the three missing items."""
    lines = [
        line("pâtes", Carrefour=1.20, Franprix=1.40),
        line("café", Carrefour=3.50, Franprix=3.90),
        line("beurre", Franprix=2.30),      # Carrefour doesn't stock it
        line("thé", Franprix=4.10),         # nor this
    ]
    solo, duo = _options(lines, [("Carrefour",), ("Carrefour", "Franprix")])
    assert solo.items_covered == 2
    assert duo.items_covered == 4
    assert duo.extra_items == 2
    assert duo.saving_vs_single is None, "a bigger basket is not a saving"


def test_a_real_saving_is_still_reported() -> None:
    """Same basket, cheaper across two stores — that comparison is meaningful."""
    lines = [
        line("pâtes", Carrefour=1.20, Lidl=0.95),
        line("café", Carrefour=3.50, Lidl=4.10),
    ]
    solo, duo = _options(lines, [("Carrefour",), ("Carrefour", "Lidl")])
    assert duo.extra_items == 0
    assert duo.saving_vs_single == Decimal("0.25")


def test_the_saving_is_never_negative_when_it_is_reported() -> None:
    lines = [line("pâtes", Carrefour=1.20, Lidl=0.95), line("café", Carrefour=3.50, Lidl=4.10)]
    _, duo = _options(lines, [("Carrefour",), ("Carrefour", "Lidl")])
    assert duo.saving_vs_single is None or duo.saving_vs_single >= 0


# ── Un produit, une ligne ────────────────────────────────────────────────────
def test_the_same_product_asked_for_twice_becomes_one_line() -> None:
    """A week of meals asks for potatoes on Monday and again on Thursday.

    The store basket printed "Pommes de terre 1,30 €" twice, which reads as a
    bug rather than as two dinners.
    """
    merged = _merge_by_barcode(
        [
            ("fl:potatoes", 2, "Pommes de terre"),
            ("fl:carrots", 3, "Carottes"),
            ("fl:potatoes", 4, "pommes de terre"),
        ]
    )
    assert merged == [
        ("fl:potatoes", 6, "Pommes de terre"),  # quantities add, first label wins
        ("fl:carrots", 3, "Carottes"),
    ]


def test_merging_keeps_the_order_the_caller_chose() -> None:
    merged = _merge_by_barcode([("b", 1, "B"), ("a", 1, "A"), ("b", 1, "B")])
    assert [barcode for barcode, _, _ in merged] == ["b", "a"]


def test_a_basket_with_no_duplicates_is_untouched() -> None:
    lines = [("a", 1, "A"), ("b", 2, "B")]
    assert _merge_by_barcode(lines) == lines
