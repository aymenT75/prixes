"""Weighed produce — the fruit and veg a barcode never covers.

These guard the two decisions that make the feature honest: which readings we
are willing to keep, and the pack size a price is scaled to. Get the second one
wrong and a recipe asking for a clove of garlic costs a kilo of garlic.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from app.domains.products.fresh import (
    FRESH_CATEGORIES,
    FRESH_PREFIX,
    _pack_label,
    _usable,
    is_sold_loose,
    loose_barcode,
)
from app.domains.products.units import packs_needed, parse_quantity, unit_price


def _reading(**overrides: object) -> dict:
    """A well-formed Open Prices row for a French per-kilo produce price."""
    row = {
        "product_code": None,
        "price": 2.19,
        "price_per": "KILOGRAM",
        "currency": "EUR",
        "price_is_discounted": False,
        "category_tag": "en:potatoes",
        "location": {"osm_name": "E. Leclerc", "osm_address_country": "France"},
        "date": "2026-08-29",
    }
    row.update(overrides)
    return row


# ── Which readings we keep ───────────────────────────────────────────────────
def test_a_french_per_kilo_produce_reading_is_kept() -> None:
    assert _usable(_reading()) is True


def test_a_barcoded_product_is_left_to_the_barcode_crawl() -> None:
    assert _usable(_reading(product_code="3176582016306")) is False


def test_a_per_unit_price_is_refused() -> None:
    # "2 € the piece" says nothing about what a kilo costs, and the whole
    # costing chain reasons in kilos.
    assert _usable(_reading(price_per="UNIT")) is False


def test_a_foreign_reading_is_refused() -> None:
    assert _usable(
        _reading(location={"osm_name": "Aldi", "osm_address_country": "Belgium"})
    ) is False


def test_a_non_euro_reading_is_refused() -> None:
    assert _usable(_reading(currency="CHF")) is False


def test_a_promotional_price_is_refused() -> None:
    # Real, but not representative: a basket costed on last month's promotions
    # understates every week that follows.
    assert _usable(_reading(price_is_discounted=True)) is False


def test_an_uncurated_category_is_refused() -> None:
    # Open Prices carries 398 French categories, including typos like
    # "en:heirloom-tomatoe". Only the curated ones may reach a shopping list.
    assert _usable(_reading(category_tag="en:heirloom-tomatoe")) is False


def test_a_reading_with_no_location_is_refused() -> None:
    assert _usable(_reading(location={})) is False


# ── Identity ─────────────────────────────────────────────────────────────────
def test_the_synthetic_code_is_stable_and_not_a_barcode() -> None:
    code = loose_barcode("en:potatoes")
    assert code == "fl:potatoes"
    assert not code.isdigit()  # nothing a scanner emits can collide with it
    assert loose_barcode("en:potatoes") == code  # re-runs update, never duplicate


def test_loose_and_packaged_products_are_told_apart() -> None:
    assert is_sold_loose("fl:carrots") is True
    assert is_sold_loose("3176582016306") is False
    assert is_sold_loose(None) is False


def test_every_synthetic_code_fits_the_barcode_column() -> None:
    for tag in FRESH_CATEGORIES:
        assert len(loose_barcode(tag)) <= 32


def test_every_category_has_a_french_name_and_a_sane_pack() -> None:
    for tag, item in FRESH_CATEGORIES.items():
        assert tag.startswith(("en:", "fr:"))
        assert item.name and item.name[0].isupper()
        assert Decimal("0.05") <= item.pack_kg <= Decimal(2)


def test_two_categories_never_claim_the_same_code() -> None:
    codes = [loose_barcode(tag) for tag in FRESH_CATEGORIES]
    assert len(codes) == len(set(codes))


# ── Pack sizes: the number a shopper would recognise ─────────────────────────
@pytest.mark.parametrize(
    ("pack_kg", "label"),
    [(Decimal("0.5"), "500 g"), (Decimal("0.25"), "250 g"), (Decimal("0.1"), "100 g"),
     (Decimal(1), "1 kg")],
)
def test_pack_labels_read_like_a_shelf(pack_kg: Decimal, label: str) -> None:
    assert _pack_label(pack_kg) == label


@pytest.mark.parametrize("tag", list(FRESH_CATEGORIES))
def test_every_pack_label_parses_back_to_its_own_weight(tag: str) -> None:
    """The label is what the costing reads, so it must round-trip exactly."""
    item = FRESH_CATEGORIES[tag]
    parsed = parse_quantity(_pack_label(item.pack_kg))
    assert parsed is not None
    assert parsed == (item.pack_kg, "kg")


def test_a_clove_of_garlic_does_not_cost_a_kilo() -> None:
    """The reason pack sizes are curated per category rather than fixed at 1 kg."""
    garlic = FRESH_CATEGORIES["en:garlic"]
    packs = packs_needed(Decimal(30), "g", _pack_label(garlic.pack_kg))
    assert packs == 1
    # A kilo of garlic at 12 €/kg would be 12 €; one 100 g pack is 1,20 €.
    assert unit_price(Decimal("1.20"), _pack_label(garlic.pack_kg)) == (
        Decimal("12.00"),
        "€/kg",
    )


def test_a_recipe_weight_becomes_a_believable_number_of_packs() -> None:
    potatoes = _pack_label(FRESH_CATEGORIES["en:potatoes"].pack_kg)   # 500 g
    assert packs_needed(Decimal(1800), "g", potatoes) == 4           # 2 kg
    assert packs_needed(Decimal("1.5"), "kg", potatoes) == 3
    assert packs_needed(Decimal(200), "g", potatoes) == 1


def test_the_prefix_is_the_one_the_module_documents() -> None:
    assert FRESH_PREFIX == "fl:"
    assert loose_barcode("en:carrots").startswith(FRESH_PREFIX)
