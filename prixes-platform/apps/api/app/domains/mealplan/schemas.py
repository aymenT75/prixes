"""Weekly meal plan schemas.

The plan is a document: seven days, each with its meals, each meal with its
ingredients. It is read and written whole, which is why it lives in Mongo rather
than in three joined tables.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from app.domains.shopping.schemas import OptimizeResult, SplitResult
from app.domains.smartcart.schemas import AiLine, ResolvedLine

Slot = Literal["déjeuner", "dîner"]

DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]


# ── What the model must produce ──────────────────────────────────────────────
class AiMeal(BaseModel):
    # Unconstrained for the same reason as AiLine — see core.llm._STRIP_KEYS.
    day: int
    slot: Slot
    title: str
    ingredients: list[AiLine]


class AiMealPlan(BaseModel):
    meals: list[AiMeal]


# ── What the API exchanges ───────────────────────────────────────────────────
class MealPlanIn(BaseModel):
    servings: int = Field(default=2, ge=1, le=12)
    # One meal a day (dinner only) or two. Most households plan dinners.
    meals_per_day: Literal[1, 2] = 1
    budget_eur: Decimal | None = Field(default=None, gt=0, le=1000)
    avoid_allergens: list[str] = Field(default_factory=list, max_length=20)
    diets: list[str] = Field(default_factory=list, max_length=10)
    # Things the household simply doesn't eat — distinct from an allergy.
    dislikes: list[str] = Field(default_factory=list, max_length=20)
    # Monday of the week being planned. Defaults to the coming Monday.
    week_start: date | None = None


class MealOut(BaseModel):
    day: int
    day_label: str
    slot: Slot
    title: str
    ingredients: list[ResolvedLine]


class MealPlanOut(BaseModel):
    id: str
    week_start: date
    servings: int
    meals: list[MealOut]
    # The whole week's shopping, deduplicated across every meal.
    basket: list[ResolvedLine]
    estimated_total: Decimal | None = None
    unpriced_count: int = 0
    # Where the week is cheapest. None when we have no price for anything.
    stores: OptimizeResult | None = None
    # The week turned into one trolley per store — the same plan the shopping
    # list produces, so a week and a list can never quote different totals.
    split: SplitResult | None = None
    over_budget: bool = False
    # How many times the planner had to retry to land inside the budget. Shown
    # so an unreachable budget reads as "I tried", not as a silent failure.
    budget_attempts: int = 1


class RegenerateIn(BaseModel):
    """Redo a single meal — the button people actually press."""

    note: str | None = Field(default=None, max_length=200)
