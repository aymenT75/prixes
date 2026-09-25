"""The free weekly menu: a week composed from Prixes' own recipe catalogue.

Premium composes a week with a model; everyone else gets this — the same
questionnaire, the same pricing and store comparison, no model and no cost. The
rules that must hold are the safety ones: an allergen or a diet is a hard
filter, never a preference. Styles, the goal and the budget only rank.
"""
from __future__ import annotations

import math
import random
import re
import unicodedata
from dataclasses import dataclass
from functools import cache
from typing import cast

from app.domains.mealplan.catalog_data import RECIPES
from app.domains.mealplan.schemas import DAYS, AiMeal, MealPlanIn, Slot
from app.domains.smartcart.schemas import AiLine, Category, Unit

_CATEGORY = {
    "fl": "fruits-légumes",
    "bo": "boucherie",
    "po": "poissonnerie",
    "cr": "crèmerie",
    "es": "épicerie salée",
    "su": "épicerie sucrée",
    "sg": "surgelés",
    "bl": "boulangerie",
}

# Diets as exclusions. "halal" and "casher" here mean what a recipe can promise —
# no pork, no alcohol (and for casher no shellfish, no meat with dairy); where
# the meat itself comes from is the shopper's choice, not the recipe's.
_NO_MEAT = {"viande", "poisson", "fruits de mer"}


@dataclass(frozen=True)
class Recipe:
    title: str
    equipment: frozenset[str]
    styles: frozenset[str]
    allergens: frozenset[str]
    tags: frozenset[str]
    cost: int
    # (name, amount per person, unit, category)
    ingredients: tuple[tuple[str, float, str, str], ...]

    def lines(self, servings: int) -> list[AiLine]:
        out = []
        for name, amount, unit, category in self.ingredients:
            total = amount * servings
            # Counted items read in halves ("1 boîte", not "0.9 boîte"). Whole
            # packs are decided later, on the week's summed basket, so rounding up
            # to the half here never buys a pack per meal.
            if unit in {"pièce", "boîte", "pot", "tranche", "sachet", "botte"}:
                total = math.ceil(total * 2) / 2
            out.append(
                AiLine(
                    product_name=name,
                    amount=round(total, 2),
                    unit=cast(Unit, unit),
                    category=cast(Category, category),
                )
            )
        return out


def _set(field: str) -> frozenset[str]:
    field = field.strip()
    if field == "-":
        return frozenset()
    return frozenset(x.strip() for x in field.split(",") if x.strip())


@cache
def recipes() -> tuple[Recipe, ...]:
    out = []
    for raw in RECIPES.strip().splitlines():
        title, equipment, styles, allergens, tags, cost, ingredients = (
            p.strip() for p in raw.split(" | ")
        )
        parsed = []
        for item in ingredients.split(";"):
            name, amount, unit, code = (x.strip() for x in item.split(":"))
            parsed.append((name, float(amount), unit, _CATEGORY[code]))
        out.append(
            Recipe(
                title=title,
                equipment=_set(equipment),
                styles=_set(styles),
                allergens=_set(allergens),
                tags=_set(tags),
                cost=int(cost),
                ingredients=tuple(parsed),
            )
        )
    return tuple(out)


def _fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.casefold())
    return "".join(c for c in text if not unicodedata.combining(c))


def allowed(recipe: Recipe, data: MealPlanIn) -> bool:
    """The hard filters: allergens, diets, kitchen, dislikes. Never relaxed."""
    avoid = {_fold(a) for a in data.avoid_allergens}
    if any(_fold(a) in avoid for a in recipe.allergens):
        return False
    diets = {_fold(d) for d in data.diets}
    tags = recipe.tags
    if ("vegetarien" in diets or "vegan" in diets) and tags & _NO_MEAT:
        return False
    if "vegan" in diets and recipe.allergens & {"lait", "œufs"}:
        return False
    if "sans gluten" in diets and "gluten" in recipe.allergens:
        return False
    if "sans lactose" in diets and "lait" in recipe.allergens:
        return False
    if ("halal" in diets or "casher" in diets) and tags & {"porc", "alcool"}:
        return False
    if "casher" in diets and (
        "fruits de mer" in tags or ("viande" in tags and "lait" in recipe.allergens)
    ):
        return False
    # Everything the recipe needs must be in the kitchen. No answer = no limit.
    if data.equipment and not recipe.equipment <= set(data.equipment):
        return False
    if data.dislikes:
        haystack = _fold(recipe.title + " " + " ".join(i[0] for i in recipe.ingredients))
        if any(_fold(d) in haystack for d in data.dislikes if d.strip()):
            return False
    return True


def _max_cost(data: MealPlanIn, cheaper: bool) -> int:
    """A budget turns into a ceiling on the recipe's cost level."""
    if cheaper:
        return 1
    if not data.budget_eur:
        return 3
    per_meal = float(data.budget_eur) / (data.servings * 7 * data.meals_per_day)
    return 1 if per_meal < 2.2 else 2 if per_meal < 3.5 else 3


def _score(recipe: Recipe, data: MealPlanIn, rng: random.Random) -> float:
    score = 2.0 * len(recipe.styles & set(data.styles))
    goal_style = {"budget": "economique", "temps": "rapide", "sante": "healthy", "idees": "monde"}
    if data.goal and goal_style[data.goal] in recipe.styles:
        score += 1.5
    if data.goal == "budget":
        score += 3 - recipe.cost
    # The jitter is what makes "Refaire toute la semaine" give another week.
    return score + rng.random() * 1.5


def compose(
    data: MealPlanIn,
    avoid_titles: list[str] | None = None,
    cheaper: bool = False,
    rng: random.Random | None = None,
) -> list[AiMeal]:
    """A week of distinct recipes, best matches first, within the hard filters."""
    rng = rng or random.Random()  # noqa: S311 — variety between weeks, not security
    avoid = {_fold(t) for t in avoid_titles or []}
    pool = [r for r in recipes() if allowed(r, data) and _fold(r.title) not in avoid]
    if not pool:
        return []
    ceiling = _max_cost(data, cheaper)
    affordable = [r for r in pool if r.cost <= ceiling] or pool
    ranked = sorted(affordable, key=lambda r: _score(r, data, rng), reverse=True)

    day_slots: tuple[Slot, ...] = ("déjeuner", "dîner") if data.meals_per_day == 2 else ("dîner",)
    slots: list[tuple[int, Slot]] = [(day, slot) for day in range(7) for slot in day_slots]
    # A short pool (strict diet + small kitchen) repeats rather than leaving
    # empty days, but never the same dish twice in a row.
    chosen: list[Recipe] = []
    for i in range(len(slots)):
        pick = ranked[i % len(ranked)]
        if chosen and pick is chosen[-1] and len(ranked) > 1:
            pick = ranked[(i + 1) % len(ranked)]
        chosen.append(pick)
    return [
        AiMeal(day=day, slot=slot, title=recipe.title, ingredients=recipe.lines(data.servings))
        for (day, slot), recipe in zip(slots, chosen, strict=True)
    ]


def replacement(
    data: MealPlanIn, day: int, slot: Slot, week_titles: list[str], rng: random.Random | None = None
) -> AiMeal | None:
    """Another recipe for one meal, different from everything already in the week."""
    meals = compose(data, avoid_titles=week_titles, rng=rng)
    if not meals:
        return None
    return meals[0].model_copy(update={"day": day % 7, "slot": slot})


_WORD = re.compile(r"[a-z0-9]+")
# Words that say nothing about the dish: "ingrédients pour une raclette pour 6".
_STOP = {
    "pour", "une", "des", "les", "avec", "aux", "sans", "ingredients", "recette",
    "personnes", "personne", "faire", "pers", "mon", "ma", "mes", "the", "et", "de",
    "du", "la", "le", "au", "en", "un",
}


def find(prompt: str) -> Recipe | None:
    """The catalogue recipe a free-text request names, if any ("une raclette pour 6")."""
    words = {w for w in _WORD.findall(_fold(prompt)) if len(w) > 2 and w not in _STOP}
    if not words:
        return None
    best: tuple[float, Recipe] | None = None
    for recipe in recipes():
        title = set(_WORD.findall(_fold(recipe.title)))
        hits = len(words & title)
        if not hits:
            continue
        # Share of the request found in the title, then shortest title: "raclette"
        # is the Raclette, not a longer dish that mentions it.
        score = hits / len(words) - len(title) / 100
        if best is None or score > best[0]:
            best = (score, recipe)
    return best[1] if best else None


def servings_in(prompt: str) -> int | None:
    match = re.search(r"\b(\d{1,2})\s*(?:pers|personnes?|convives?)?\b", _fold(prompt))
    return int(match.group(1)) if match and 0 < int(match.group(1)) <= 50 else None


__all__ = ["DAYS", "Recipe", "allowed", "compose", "find", "recipes", "replacement", "servings_in"]
