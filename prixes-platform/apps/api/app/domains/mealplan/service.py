"""Weekly meal plan: generate, price, store, and redo one meal at a time.

The plan document lives in Mongo, one per user per week. Everything that touches
money — matching a catalog product, summing a basket, ranking stores — goes
through the same code the shopping list uses, so a week's total and a list's
total can never disagree.
"""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any, cast

from fastapi import HTTPException, status
from pydantic import ValidationError
from pymongo import ReturnDocument
from pymongo.errors import PyMongoError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.llm import generate_json, llm_enabled
from app.core.mongo import MEAL_PLANS, MongoDb
from app.domains.mealplan import catalog
from app.domains.mealplan.schemas import (
    DAYS,
    AiMeal,
    AiMealPlan,
    MealOut,
    MealPlanIn,
    MealPlanOut,
    Slot,
)
from app.domains.shopping import service as shopping_service
from app.domains.shopping.schemas import OptimizeResult, SplitResult
from app.domains.smartcart.prompt import MEAL_PLAN_SYSTEM
from app.domains.smartcart.resolve import aggregate_lines, resolve_lines
from app.domains.smartcart.schemas import AiLine, ResolvedLine

logger = logging.getLogger(__name__)

_MAX_MEALS = 14
# One retry when the menu overshoots the budget. A second costs more in tokens
# and waiting than it saves in euros.
_MAX_BUDGET_ATTEMPTS = 2


def coming_monday(today: date | None = None) -> date:
    """The Monday of the week being planned — today's if we're already in it."""
    today = today or datetime.now(UTC).date()
    return today - timedelta(days=today.weekday())


_GOAL = {
    "budget": "Priorité : dépenser le moins possible.",
    "temps": "Priorité : gagner du temps — peu de préparation, peu de vaisselle.",
    "sante": (
        "Priorité : manger plus sainement — légumes, légumineuses, "
        "peu de produits transformés."
    ),
    "idees": "Priorité : de la variété et des idées nouvelles, sans plats trop techniques.",
}
_EQUIPMENT = {
    "four": "four",
    "plaques": "plaques de cuisson",
    "micro-ondes": "micro-ondes",
    "airfryer": "airfryer",
    "robot": "robot cuiseur",
    "autocuiseur": "autocuiseur",
}
_STYLE = {
    "rapide": "rapide et facile",
    "healthy": "healthy",
    "classique": "classique",
    "economique": "économique",
    "reconfort": "réconfortant",
    "one-pot": "one pot (tout dans une seule casserole)",
    "monde": "cuisine du monde",
}


def _kitchen_lines(data: MealPlanIn) -> list[str]:
    """The questionnaire, as sentences. Shared by the week and the single-meal redo,
    so swapping a dinner cannot bring back the oven you said you don't have."""
    lines: list[str] = []
    if data.goal:
        lines.append(_GOAL[data.goal])
    if data.equipment:
        lines.append(
            "Matériel disponible, UNIQUEMENT : "
            + ", ".join(_EQUIPMENT[e] for e in data.equipment)
            + ". Aucune recette ne doit demander un autre appareil."
        )
    if data.styles:
        lines.append("Style de repas souhaité : " + ", ".join(_STYLE[s] for s in data.styles) + ".")
    return lines


def _user_prompt(data: MealPlanIn, avoid_titles: list[str] | None = None) -> str:
    meals = 7 * data.meals_per_day
    lines = [
        f"Compose {meals} repas pour la semaine "
        + ("(déjeuner et dîner)." if data.meals_per_day == 2 else "(dîner uniquement)."),
        f"Foyer de {data.servings} personne(s).",
    ]
    if data.budget_eur:
        lines.append(
            f"Budget courses visé pour la semaine : {data.budget_eur} €. "
            "Choisis des plats qui tiennent dans ce budget."
        )
    if data.avoid_allergens:
        lines.append(
            "INTERDIT (allergies) — aucun repas ne doit en contenir : "
            + ", ".join(data.avoid_allergens)
            + "."
        )
    if data.diets:
        lines.append("Régime à respecter : " + ", ".join(data.diets) + ".")
    if data.dislikes:
        lines.append("Le foyer n'aime pas : " + ", ".join(data.dislikes) + ".")
    lines.extend(_kitchen_lines(data))
    if avoid_titles:
        lines.append(
            "Ne propose PAS ces plats, déjà prévus cette semaine : "
            + ", ".join(avoid_titles)
            + "."
        )
    lines.append(
        "Numérote les jours de 0 (lundi) à 6 (dimanche). "
        "`slot` vaut « dîner » quand il n'y a qu'un repas par jour."
    )
    return "\n".join(lines)


async def _ask_model(system: str, user: str, max_tokens: int) -> AiMealPlan | None:
    raw = await generate_json(
        system=system,
        user=user,
        schema=AiMealPlan.model_json_schema(),
        schema_name="menu_semaine",
        max_tokens=max_tokens,
        timeout_s=45.0,  # a whole week is a much bigger answer than one basket
    )
    if raw is None:
        return None
    try:
        return AiMealPlan.model_validate(raw)
    except ValidationError as exc:
        logger.warning(f"Meal plan failed validation: {exc}")
        return None


async def _price_week(
    db: AsyncSession, meals: list[AiMeal], avoid_allergens: list[str]
) -> tuple[list[MealOut], list[ResolvedLine], OptimizeResult | None, SplitResult | None]:
    """Resolve each meal's ingredients, then the deduplicated week's basket.

    The week ends where the shopping list ends: one trolley per store. Both go
    through `shopping_service`, so a week and a list can never disagree.
    """
    out_meals: list[MealOut] = []
    for meal in meals:
        resolved = await resolve_lines(db, meal.ingredients, avoid_allergens)
        out_meals.append(
            MealOut(
                day=meal.day,
                day_label=DAYS[meal.day % 7],
                slot=meal.slot,
                title=meal.title,
                ingredients=resolved,
            )
        )

    every_ingredient: list[AiLine] = [line for meal in meals for line in meal.ingredients]
    basket = await resolve_lines(db, aggregate_lines(every_ingredient), avoid_allergens)

    priced = [
        (b.barcode, b.quantity, b.matched_name or b.product_name) for b in basket if b.barcode
    ]
    stores = await shopping_service.optimize_lines(db, priced) if priced else None
    split = await shopping_service.split_lines(db, priced) if priced else None
    return out_meals, basket, stores, split


def _totals(basket: list[ResolvedLine]) -> tuple[Decimal | None, int]:
    total = sum((line.best_price or Decimal(0)) * line.quantity for line in basket)
    unpriced = sum(1 for line in basket if line.best_price is None)
    return (Decimal(total).quantize(Decimal("0.01")) if total else None), unpriced


def _document(
    user_id: uuid.UUID, week_start: date, data: MealPlanIn, meals: list[AiMeal]
) -> dict[str, Any]:
    return {
        "user_id": str(user_id),
        "week_start": week_start.isoformat(),
        "servings": data.servings,
        "meals_per_day": data.meals_per_day,
        "budget_eur": str(data.budget_eur) if data.budget_eur else None,
        "constraints": {
            "avoid_allergens": data.avoid_allergens,
            "diets": data.diets,
            "dislikes": data.dislikes,
            "goal": data.goal,
            "equipment": data.equipment,
            "styles": data.styles,
        },
        "meals": [meal.model_dump(mode="json") for meal in meals],
        "updated_at": datetime.now(UTC),
    }


def _assemble(
    doc_id: str,
    week_start: date,
    data: MealPlanIn,
    meals: list[MealOut],
    basket: list[ResolvedLine],
    stores: OptimizeResult | None,
    split: SplitResult | None = None,
    budget_attempts: int = 1,
) -> MealPlanOut:
    total, unpriced = _totals(basket)
    # Judge the budget on what the shop will actually cost — the cheapest plan —
    # not on the sum of best-prices-anywhere, which no single trip achieves.
    payable = split.options[-1].total if split and split.options else total
    return MealPlanOut(
        id=doc_id,
        week_start=week_start,
        servings=data.servings,
        meals=sorted(meals, key=lambda m: (m.day, m.slot)),
        basket=basket,
        estimated_total=total,
        unpriced_count=unpriced,
        stores=stores,
        split=split,
        over_budget=bool(data.budget_eur and payable and payable > data.budget_eur),
        budget_attempts=budget_attempts,
    )


def _restore_input(doc: dict[str, Any]) -> MealPlanIn:
    constraints = doc.get("constraints", {})
    return MealPlanIn(
        servings=doc.get("servings", 2),
        meals_per_day=doc.get("meals_per_day", 1),
        budget_eur=Decimal(doc["budget_eur"]) if doc.get("budget_eur") else None,
        avoid_allergens=constraints.get("avoid_allergens", []),
        diets=constraints.get("diets", []),
        dislikes=constraints.get("dislikes", []),
        # Weeks stored before the questionnaire have none of these: no constraint.
        goal=constraints.get("goal"),
        equipment=constraints.get("equipment", []),
        styles=constraints.get("styles", []),
        week_start=date.fromisoformat(doc["week_start"]),
    )


def _over_budget_note(spent: Decimal, budget: Decimal) -> str:
    """Tell the planner what it overshot by, and how to come down.

    Naming the figure matters: "fais moins cher" produces a token gesture, while
    "tu es à 78 € pour 60 €" produces a different menu.
    """
    return "\n\n".join(
        [
            "",
            f"TON MENU PRÉCÉDENT COÛTAIT {spent} € pour un budget de {budget} €. "
            "Refais-le nettement moins cher : plats plus simples, protéines "
            "économiques (œufs, légumineuses, volaille), légumes de saison, et "
            "réutilise davantage les mêmes ingrédients.",
        ]
    )


def _payable(split: SplitResult | None, fallback: Decimal | None) -> Decimal | None:
    """What the shop really costs: the best complete plan, not the best prices.

    `estimated_total` sums each item's cheapest price anywhere, which would need
    a trip to six chains. Holding a budget against that number would reject menus
    that are perfectly affordable in two stores.
    """
    if split and split.options:
        return split.options[-1].total
    return fallback


def _no_recipe() -> HTTPException:
    return HTTPException(
        status.HTTP_422_UNPROCESSABLE_ENTITY,
        "Aucune recette ne correspond à vos réponses. Ajoutez du matériel de cuisine "
        "ou retirez un style de repas.",
    )


async def generate(
    db: AsyncSession,
    mongo: MongoDb | None,
    user_id: uuid.UUID,
    data: MealPlanIn,
    use_ai: bool = True,
) -> MealPlanOut:
    """A week of meals: invented by the model for Premium, drawn from the recipe
    catalogue for everyone else — and for Premium too when the model is down,
    rather than no menu at all."""
    week_start = data.week_start or coming_monday()
    use_ai = use_ai and llm_enabled()

    if use_ai:
        plan = await _ask_model(MEAL_PLAN_SYSTEM, _user_prompt(data), max_tokens=6000)
        meals = plan.meals[:_MAX_MEALS] if plan else []
    else:
        meals = catalog.compose(data)
    if not meals:
        if not use_ai:
            raise _no_recipe()
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Le menu n'a pas pu être généré. Réessayez dans un instant.",
        )
    out_meals, basket, stores, split = await _price_week(db, meals, data.avoid_allergens)
    attempts = 1

    # A budget the planner is told about but never checked against is a wish. Price
    # the menu, and if it overshoots, say by how much and ask again. One retry:
    # beyond that the cost and the wait stop being worth the euros saved, and an
    # impossible budget would loop forever.
    while (
        data.budget_eur
        and attempts < _MAX_BUDGET_ATTEMPTS
        and (over := _payable(split, _totals(basket)[0]))
        and over > data.budget_eur
    ):
        logger.info(f"Meal plan over budget ({over} > {data.budget_eur}), retrying")
        if use_ai:
            retry = await _ask_model(
                MEAL_PLAN_SYSTEM,
                _user_prompt(data)
                + _over_budget_note(over, data.budget_eur),
                max_tokens=6000,
            )
            cheaper = retry.meals[:_MAX_MEALS] if retry else []
        else:
            # The catalogue's answer to "too dear": only its cheapest recipes.
            cheaper = catalog.compose(data, cheaper=True)
        attempts += 1
        if not cheaper:
            break
        c_meals, c_basket, c_stores, c_split = await _price_week(
            db, cheaper, data.avoid_allergens
        )
        # Keep the retry only if it actually costs less — a "cheaper" menu that
        # is dearer is worse than the one we already had.
        if (_payable(c_split, _totals(c_basket)[0]) or over) < over:
            meals, out_meals, basket, stores, split = (
                cheaper, c_meals, c_basket, c_stores, c_split,
            )

    # Composing a week does not need a document store — only remembering it does.
    # Without Mongo the plan is still generated, priced and sent to the list; it
    # simply is not there when you come back.
    doc_id = ""
    if mongo is not None:
        doc = _document(user_id, week_start, data, meals)
        try:
            stored = await mongo[MEAL_PLANS].find_one_and_replace(
                {"user_id": str(user_id), "week_start": week_start.isoformat()},
                doc,
                upsert=True,
                return_document=ReturnDocument.AFTER,
            )
            # upsert + AFTER always returns the document; the driver's type says Optional.
            if stored is not None:
                doc_id = str(stored["_id"])
        except PyMongoError as exc:
            # The menu is still worth showing even if we could not save it.
            logger.warning(f"Meal plan not stored: {exc}")

    return _assemble(doc_id, week_start, data, out_meals, basket, stores, split, attempts)


async def get_current(
    db: AsyncSession, mongo: MongoDb | None, user_id: uuid.UUID, week_start: date | None
) -> MealPlanOut | None:
    if mongo is None:
        return None  # nothing was stored, so there is nothing to restore
    week = week_start or coming_monday()
    try:
        doc = await mongo[MEAL_PLANS].find_one(
            {"user_id": str(user_id), "week_start": week.isoformat()}
        )
    except PyMongoError as exc:
        logger.warning(f"Meal plan not read: {exc}")
        return None
    if doc is None:
        return None

    data = _restore_input(doc)
    meals = [AiMeal.model_validate(m) for m in doc.get("meals", [])]
    out_meals, basket, stores, split = await _price_week(db, meals, data.avoid_allergens)
    return _assemble(str(doc["_id"]), week, data, out_meals, basket, stores, split)


async def regenerate_meal(
    db: AsyncSession,
    mongo: MongoDb,
    user_id: uuid.UUID,
    week_start: date,
    day: int,
    slot: str,
    note: str | None,
    use_ai: bool = True,
) -> MealPlanOut:
    """Replace one meal, leaving the rest of the week alone. Premium gets a dish
    invented for it; everyone else another recipe from the catalogue."""
    doc = await mongo[MEAL_PLANS].find_one(
        {"user_id": str(user_id), "week_start": week_start.isoformat()}
    )
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aucun menu pour cette semaine.")

    data = _restore_input(doc)
    meals = [AiMeal.model_validate(m) for m in doc.get("meals", [])]
    target = next((m for m in meals if m.day == day and m.slot == slot), None)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ce repas n'est pas au menu.")

    if not (use_ai and llm_enabled()):
        others = [m.title for m in meals]
        swap = catalog.replacement(data, day, cast(Slot, slot), others)
        if swap is None:
            raise _no_recipe()
        return await _replace_and_price(db, mongo, doc, week_start, data, meals, target, swap)

    prompt = "\n".join(
        [
            f"Propose UN SEUL repas de remplacement pour le {DAYS[day % 7]} ({slot}).",
            f"Foyer de {data.servings} personne(s).",
            f"Le plat à remplacer était : {target.title}. Propose autre chose.",
            *([f"Contrainte de l'utilisateur : {note}"] if note else []),
            "Ne propose pas non plus : "
            + ", ".join(m.title for m in meals if m is not target)
            + ".",
            *(
                ["INTERDIT (allergies) : " + ", ".join(data.avoid_allergens) + "."]
                if data.avoid_allergens
                else []
            ),
            *(["Régime : " + ", ".join(data.diets) + "."] if data.diets else []),
            *_kitchen_lines(data),
            f"Renvoie exactement un repas, avec day={day} et slot=« {slot} ».",
        ]
    )
    replacement = await _ask_model(MEAL_PLAN_SYSTEM, prompt, max_tokens=1200)
    if replacement is None or not replacement.meals:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "Le repas n'a pas pu être remplacé. Réessayez."
        )

    fresh = replacement.meals[0].model_copy(update={"day": day, "slot": slot})
    return await _replace_and_price(db, mongo, doc, week_start, data, meals, target, fresh)


async def _replace_and_price(
    db: AsyncSession,
    mongo: MongoDb,
    doc: dict[str, Any],
    week_start: date,
    data: MealPlanIn,
    meals: list[AiMeal],
    target: AiMeal,
    fresh: AiMeal,
) -> MealPlanOut:
    """Swap `target` for `fresh`, remember the week, and price it again."""
    meals = [fresh if m is target else m for m in meals]

    try:
        await mongo[MEAL_PLANS].update_one(
            {"_id": doc["_id"]},
            {
                "$set": {
                    "meals": [m.model_dump(mode="json") for m in meals],
                    "updated_at": datetime.now(UTC),
                }
            },
        )
    except PyMongoError as exc:
        logger.warning(f"Regenerated meal not stored: {exc}")

    out_meals, basket, stores, split = await _price_week(db, meals, data.avoid_allergens)
    return _assemble(str(doc["_id"]), week_start, data, out_meals, basket, stores, split)


async def delete_plan(mongo: MongoDb, user_id: uuid.UUID, week_start: date) -> None:
    await mongo[MEAL_PLANS].delete_one(
        {"user_id": str(user_id), "week_start": week_start.isoformat()}
    )
