"""`/products/rich-in/{nutrient}` — the bridge Hi Coach uses to turn a nutrient
gap into a priced product suggestion, without either app re-ingesting the
other's data (see products/service.py::rich_in_nutrient).

No live database is wired into this test suite (see test_smart_cart.py), so
these cover what's checkable without one: the nutrient contract Hi Coach
depends on, the numeric guard that keeps a bad OFF value from failing the
whole query, and the response shape.
"""
from __future__ import annotations

import re

import pytest

from app.domains.products.schemas import NutrientKey, RichInItem, RichInOut
from app.domains.products.service import _NUMERIC, _NUTRIENT_OFF_KEYS


def test_nutrient_keys_match_hi_coach_contract() -> None:
    """Hi Coach's shopping/service.py calls .../rich-in/{protein,fiber} — renaming
    or dropping a key here silently breaks its shopping-suggestions screen."""
    assert set(_NUTRIENT_OFF_KEYS) == {"protein", "fiber"}


def test_nutrient_keys_map_to_off_fields() -> None:
    assert _NUTRIENT_OFF_KEYS["protein"] == "proteins_100g"
    assert _NUTRIENT_OFF_KEYS["fiber"] == "fiber_100g"


@pytest.mark.parametrize("value", ["0", "12", "12.5", "0.3", "8.75"])
def test_numeric_guard_accepts_plain_decimals(value: str) -> None:
    assert re.match(_NUMERIC, value)


@pytest.mark.parametrize(
    "value",
    ["", "traces", "N/A", "-1", "1,5", "1.5.6", "1e5", None],
)
def test_numeric_guard_rejects_everything_else(value: str | None) -> None:
    """OFF `nutriments` values are occasionally non-numeric upstream — the
    guard must reject them so the DB cast never runs on a bad row."""
    if value is None:
        return
    assert re.match(_NUMERIC, value) is None


def test_rich_in_item_carries_the_fields_hi_coach_reads() -> None:
    """Field names, not just types: Hi Coach reads item["nutrient_value"] and
    item["best_price"] straight off the JSON body (shopping/service.py)."""
    item = RichInItem(
        barcode="123",
        name="Lentilles vertes",
        brand="Marque",
        image_url=None,
        quantity="500 g",
        nutriscore="a",
        ecoscore=None,
        nova_group=1,
        categories="Légumineuses",
        allergens=None,
        diets=None,
        nutrient_value=7.9,
        best_price=None,
    )
    dumped = item.model_dump(mode="json")
    assert dumped["nutrient_value"] == 7.9
    assert dumped["best_price"] is None
    assert dumped["barcode"] == "123"


def test_rich_in_out_shape() -> None:
    out = RichInOut(nutrient="fiber", items=[])
    dumped = out.model_dump(mode="json")
    assert dumped == {"nutrient": "fiber", "items": []}


def test_nutrient_key_literal_is_exactly_protein_and_fiber() -> None:
    import typing

    assert typing.get_args(NutrientKey) == ("protein", "fiber")
