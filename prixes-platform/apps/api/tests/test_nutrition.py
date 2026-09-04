"""Nutrition extraction from OpenFoodFacts payloads.

OFF is crowd-sourced and the health score acts on these numbers, so the bounds
here matter the way `is_plausible_price` matters for prices: a mis-keyed field
must be dropped, never surfaced as if it were real.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from app.domains.products.off import NUTRIMENT_KEYS, extract_nutrition


def test_reads_a_normal_payload() -> None:
    out = extract_nutrition(
        {
            "nutriments": {
                "energy-kcal_100g": 539,
                "proteins_100g": 6.3,
                "carbohydrates_100g": 57.5,
                "sugars_100g": 56.3,
                "fiber_100g": 0,
                "fat_100g": 30.9,
                "saturated-fat_100g": 10.6,
                "salt_100g": 0.107,
                "fruits-vegetables-nuts-estimate-from-ingredients_100g": 13,
            }
        }
    )
    assert out["energy_kcal_100g"] == Decimal("539")
    assert out["proteins_100g"] == Decimal("6.3")
    assert out["sugars_100g"] == Decimal("56.3")
    assert out["salt_100g"] == Decimal("0.107")
    assert out["fruits_vegetables_nuts_100g"] == Decimal("13")


def test_every_column_is_always_present() -> None:
    # Callers setattr the whole dict; a missing key would silently keep a stale value.
    out = extract_nutrition({})
    assert set(out) == set(NUTRIMENT_KEYS)
    assert all(v is None for v in out.values())


@pytest.mark.parametrize(
    "payload", [{}, {"nutriments": None}, {"nutriments": []}, {"nutriments": {}}]
)
def test_missing_or_malformed_nutriments_yield_none(payload: dict) -> None:
    assert extract_nutrition(payload)["energy_kcal_100g"] is None


def test_zero_is_kept_not_treated_as_missing() -> None:
    # A sugar-free product declares 0 — the single most useful value for a
    # diabetic profile. It must survive as 0, never collapse to None.
    out = extract_nutrition({"nutriments": {"sugars_100g": 0}})
    assert out["sugars_100g"] == Decimal("0")
    assert out["sugars_100g"] is not None


def test_string_values_and_comma_decimals_are_parsed() -> None:
    out = extract_nutrition({"nutriments": {"proteins_100g": "12,5", "salt_100g": " 1.2 "}})
    assert out["proteins_100g"] == Decimal("12.5")
    assert out["salt_100g"] == Decimal("1.2")


@pytest.mark.parametrize(
    "value", [-1, 101, 5000, "abc", "", None, float("inf"), float("nan")]
)
def test_implausible_gram_values_are_dropped(value: object) -> None:
    assert extract_nutrition({"nutriments": {"sugars_100g": value}})["sugars_100g"] is None


def test_energy_above_pure_fat_is_dropped() -> None:
    # 3700 is the kJ value typed under the kcal key — the classic OFF slip.
    assert extract_nutrition({"nutriments": {"energy-kcal_100g": 3700}})["energy_kcal_100g"] is None


def test_energy_falls_back_to_kilojoules() -> None:
    # EU labels state kJ first, so plenty of products carry only that.
    out = extract_nutrition({"nutriments": {"energy-kj_100g": 2255}})
    assert out["energy_kcal_100g"] == Decimal("538.958")


def test_energy_kcal_wins_over_kilojoules() -> None:
    out = extract_nutrition({"nutriments": {"energy-kcal_100g": 539, "energy-kj_100g": 2255}})
    assert out["energy_kcal_100g"] == Decimal("539")


def test_kilojoule_fallback_still_bounded() -> None:
    # 9999 kJ -> 2390 kcal, physically impossible: the conversion must not smuggle
    # a bad value past the ceiling.
    assert extract_nutrition({"nutriments": {"energy-kj_100g": 9999}})["energy_kcal_100g"] is None


def test_fruit_share_prefers_the_computed_estimate() -> None:
    out = extract_nutrition(
        {
            "nutriments": {
                "fruits-vegetables-nuts-estimate-from-ingredients_100g": 40,
                "fruits-vegetables-nuts_100g": 25,
            }
        }
    )
    assert out["fruits_vegetables_nuts_100g"] == Decimal("40")


def test_fruit_share_falls_back_to_the_declared_value() -> None:
    out = extract_nutrition({"nutriments": {"fruits-vegetables-nuts_100g": 25}})
    assert out["fruits_vegetables_nuts_100g"] == Decimal("25")


def test_fibers_alternate_spelling_is_read() -> None:
    assert extract_nutrition({"nutriments": {"fibers_100g": 4.2}})["fiber_100g"] == Decimal("4.2")


def test_normalised_keys_all_map_to_product_columns() -> None:
    """`_normalise_off` is splatted straight onto a Product via setattr, so a key
    that isn't a column would be silently dropped. This is the guard for that —
    it fails the moment a nutriment is renamed on one side only."""
    from app.domains.products.models import Product
    from app.domains.products.off import _normalise_off

    normalised = _normalise_off(
        "3017620422003",
        {
            "product_name_fr": "Nutella",
            "brands": "Ferrero",
            "nutriscore_grade": "e",
            "nutriments": {"energy-kcal_100g": 539, "sugars_100g": 56.3},
        },
    )
    columns = set(Product.__table__.columns.keys())
    assert set(normalised) <= columns, f"not columns: {set(normalised) - columns}"
    # And the nutrition survives normalisation, not just the shape.
    assert normalised["energy_kcal_100g"] == Decimal("539")
    assert normalised["sugars_100g"] == Decimal("56.3")
