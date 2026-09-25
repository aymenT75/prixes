# ruff: noqa: S311 — seeded generators make the weeks reproducible; nothing here is secret.
"""The free menu's recipe catalogue — the safety rules first.

An allergy or a diet is a hard filter: a week must never contain a recipe that
breaks one, whatever the styles or the budget ask for. The rest only ranks.
"""
from __future__ import annotations

import random
from typing import get_args

import pytest

from app.domains.mealplan import catalog
from app.domains.mealplan.schemas import Equipment, MealPlanIn, Style
from app.domains.smartcart.schemas import Category, Unit

ALLERGENS = {
    "gluten", "lait", "œufs", "fruits à coque", "arachides", "soja", "poisson",
    "crustacés", "mollusques", "céleri", "moutarde", "sésame", "sulfites", "lupin",
}
TAGS = {"viande", "porc", "poisson", "fruits de mer", "alcool"}


def week(**kw: object) -> list[catalog.Recipe]:
    data = MealPlanIn(**kw)  # type: ignore[arg-type]
    titles = [m.title for m in catalog.compose(data, rng=random.Random(1))]
    by_title = {r.title: r for r in catalog.recipes()}
    return [by_title[t] for t in titles]


# ── The data itself ──────────────────────────────────────────────────────────
def test_the_catalogue_is_big_enough_for_varied_weeks() -> None:
    assert len(catalog.recipes()) >= 120


def test_every_recipe_uses_only_known_vocabulary() -> None:
    units, categories = set(get_args(Unit)), set(get_args(Category))
    equipment, styles = set(get_args(Equipment)), set(get_args(Style))
    for r in catalog.recipes():
        assert r.equipment and r.equipment <= equipment, r.title
        assert r.styles and r.styles <= styles, r.title
        assert r.allergens <= ALLERGENS, r.title
        assert r.tags <= TAGS, r.title
        assert r.cost in {1, 2, 3}, r.title
        for name, amount, unit, category in r.ingredients:
            assert name and amount > 0, r.title
            assert unit in units and category in categories, r.title


def test_titles_are_unique() -> None:
    titles = [r.title for r in catalog.recipes()]
    assert len(titles) == len(set(titles))


def test_meat_and_fish_are_declared() -> None:
    """A recipe with chicken or salmon must carry the tag the diets filter on."""
    meat = (
        "poulet", "bœuf", "porc", "lardons", "jambon", "saucisse", "merguez", "agneau",
        "chorizo", "volaille", "salé",
    )
    fish = ("saumon", "thon", "cabillaud", "colin", "maquereau", "crevettes", "moules")
    for r in catalog.recipes():
        names = " ".join(i[0] for i in r.ingredients)
        if any(m in names for m in meat):
            assert "viande" in r.tags, r.title
        if any(f in names for f in fish):
            assert r.tags & {"poisson", "fruits de mer"}, r.title


# ── Hard filters ─────────────────────────────────────────────────────────────
@pytest.mark.parametrize("allergen", sorted(ALLERGENS))
def test_an_allergen_never_reaches_the_week(allergen: str) -> None:
    for r in week(avoid_allergens=[allergen], meals_per_day=2):
        assert allergen not in r.allergens, r.title


def test_vegetarian_weeks_have_no_meat_or_fish() -> None:
    for r in week(diets=["végétarien"], meals_per_day=2):
        assert not r.tags & {"viande", "poisson", "fruits de mer"}, r.title


def test_vegan_weeks_have_no_animal_product() -> None:
    for r in week(diets=["végan"]):
        assert not r.tags & {"viande", "poisson", "fruits de mer"}, r.title
        assert not r.allergens & {"lait", "œufs"}, r.title


def test_halal_weeks_have_no_pork_or_alcohol() -> None:
    for r in week(diets=["halal"], meals_per_day=2):
        assert not r.tags & {"porc", "alcool"}, r.title


def test_casher_weeks_never_mix_meat_and_dairy() -> None:
    for r in week(diets=["casher"], meals_per_day=2):
        assert not ("viande" in r.tags and "lait" in r.allergens), r.title
        assert not r.tags & {"porc", "fruits de mer"}, r.title


def test_only_the_kitchen_the_user_has() -> None:
    for r in week(equipment=["micro-ondes"]):
        assert r.equipment <= {"micro-ondes"}, r.title


def test_a_disliked_ingredient_is_left_out() -> None:
    for r in week(dislikes=["champignons"], meals_per_day=2):
        assert "champignon" not in r.title.lower()
        assert not any("champignon" in i[0] for i in r.ingredients), r.title


def test_an_impossible_combination_gives_no_week_rather_than_a_wrong_one() -> None:
    data = MealPlanIn(equipment=["micro-ondes"], diets=["végan"], avoid_allergens=["soja"])
    assert all(
        catalog.allowed(r, data) for r in week(equipment=["micro-ondes"], diets=["végan"])
    )


# ── Composition ──────────────────────────────────────────────────────────────
def test_a_week_has_seven_distinct_dinners() -> None:
    meals = catalog.compose(MealPlanIn(), rng=random.Random(2))
    assert [m.day for m in meals] == list(range(7))
    assert len({m.title for m in meals}) == 7


def test_two_meals_a_day_fill_fourteen_slots() -> None:
    meals = catalog.compose(MealPlanIn(meals_per_day=2), rng=random.Random(3))
    assert len(meals) == 14
    assert {m.slot for m in meals} == {"déjeuner", "dîner"}


def test_a_small_pool_repeats_but_never_twice_in_a_row() -> None:
    meals = catalog.compose(MealPlanIn(equipment=["micro-ondes"], meals_per_day=2))
    assert len(meals) == 14
    for a, b in zip(meals, meals[1:], strict=False):
        assert a.title != b.title


def test_amounts_scale_with_the_household() -> None:
    recipe = next(r for r in catalog.recipes() if r.title == "Spaghetti bolognaise")
    two = {line.product_name: line.amount for line in recipe.lines(2)}
    four = {line.product_name: line.amount for line in recipe.lines(4)}
    assert four["spaghetti"] == 2 * two["spaghetti"]


def test_counted_items_read_in_halves() -> None:
    for r in catalog.recipes():
        for line in r.lines(3):
            if line.unit in {"pièce", "boîte", "pot", "tranche", "sachet", "botte"}:
                assert (line.amount * 2).is_integer(), (r.title, line)


def test_a_tight_budget_picks_cheap_recipes() -> None:
    for r in week(budget_eur="20", servings=2):
        assert r.cost == 1, r.title


def test_styles_rank_first() -> None:
    picked = week(styles=["monde"])
    assert sum("monde" in r.styles for r in picked) >= 6


def test_redoing_a_week_gives_another_week() -> None:
    first = {m.title for m in catalog.compose(MealPlanIn(), rng=random.Random(10))}
    second = {m.title for m in catalog.compose(MealPlanIn(), rng=random.Random(11))}
    assert first != second


def test_a_replacement_is_new_to_the_week() -> None:
    data = MealPlanIn()
    meals = catalog.compose(data, rng=random.Random(4))
    swap = catalog.replacement(data, 2, "dîner", [m.title for m in meals])
    assert swap is not None
    assert swap.title not in {m.title for m in meals}
    assert (swap.day, swap.slot) == (2, "dîner")


# ── The free assistant ───────────────────────────────────────────────────────
def test_a_named_dish_is_found() -> None:
    found = catalog.find("ingrédients pour une raclette pour 6")
    assert found is not None and found.title == "Raclette"
    assert catalog.servings_in("une raclette pour 6") == 6


def test_accents_and_case_do_not_matter() -> None:
    found = catalog.find("TAJINE de poulet")
    assert found is not None and "Tajine" in found.title


def test_an_unknown_request_finds_nothing() -> None:
    assert catalog.find("je veux repeindre ma cuisine") is None
