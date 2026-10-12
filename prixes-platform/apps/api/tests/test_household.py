"""The household questions: children at half a portion, fewer days, quick recipes."""
from __future__ import annotations

import random

from app.domains.mealplan import catalog
from app.domains.mealplan.schemas import MealPlanIn, portions


def week(**kw: object) -> list:
    data = MealPlanIn(equipment=["plaques", "four"], **kw)  # type: ignore[arg-type]
    return catalog.compose(data, rng=random.Random(1))  # noqa: S311 — a fixed test week


def test_a_child_is_half_a_portion() -> None:
    assert portions(MealPlanIn(servings=2, children=1)) == 3
    assert portions(MealPlanIn(servings=2, children=2)) == 3
    assert portions(MealPlanIn(servings=2)) == 2


def test_only_the_days_asked_for() -> None:
    meals = week(days=5)
    assert len(meals) == 5
    assert max(m.day for m in meals) == 4


def test_children_raise_the_quantities() -> None:
    alone = week(servings=2)[0].ingredients[0].amount
    family = week(servings=2, children=2)[0].ingredients[0].amount
    assert family > alone


def test_a_dislike_names_a_family() -> None:
    from app.domains.mealplan.catalog import _dislike_words

    assert "saumon" in _dislike_words("Poisson")
    assert "piment" in _dislike_words("Épicé")
    assert _dislike_words("Champignons") == ("champignon",)
