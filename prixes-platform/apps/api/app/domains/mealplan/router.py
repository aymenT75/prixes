"""Weekly meal plan HTTP API."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.core.mongo import Mongo
from app.core.rate_limit import RateLimit
from app.domains.mealplan import service
from app.domains.mealplan.schemas import MealPlanIn, MealPlanOut, RegenerateIn
from app.domains.shopping import service as shopping_service
from app.domains.shopping.router import _enrich
from app.domains.shopping.schemas import BulkAddOut, ShoppingItemIn

router = APIRouter(prefix="/meal-plan", tags=["meal-plan"])

# A week is a much larger generation than a single basket, so it gets its own,
# tighter budget rather than sharing the smart-cart bucket.
_LIMIT = Depends(RateLimit("mealplan", times=settings.mealplan_rate_per_day, window=86400))


@router.get("", response_model=MealPlanOut | None)
async def current(
    db: DbSession,
    mongo: Mongo,
    user: CurrentUser,
    week_start: date | None = None,
) -> MealPlanOut | None:
    """The plan for a week, re-priced at read time — prices move, menus don't."""
    return await service.get_current(db, mongo, user.id, week_start)


@router.post("", response_model=MealPlanOut, status_code=201, dependencies=[_LIMIT])
async def generate(
    data: MealPlanIn, db: DbSession, mongo: Mongo, user: CurrentUser
) -> MealPlanOut:
    return await service.generate(db, mongo, user.id, data)


@router.post(
    "/{week_start}/meals/{day}/regenerate", response_model=MealPlanOut, dependencies=[_LIMIT]
)
async def regenerate(
    week_start: date,
    day: int,
    data: RegenerateIn,
    db: DbSession,
    mongo: Mongo,
    user: CurrentUser,
    slot: str = "dîner",
) -> MealPlanOut:
    """Swap one meal without touching the rest of the week."""
    return await service.regenerate_meal(
        db, mongo, user.id, week_start, day, slot, data.note
    )


@router.post("/{week_start}/to-list", response_model=BulkAddOut, status_code=201)
async def to_shopping_list(
    week_start: date, db: DbSession, mongo: Mongo, user: CurrentUser
) -> BulkAddOut:
    """Send the week's deduplicated basket to the shopping list."""
    plan = await service.get_current(db, mongo, user.id, week_start)
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aucun menu pour cette semaine.")

    payload = [
        ShoppingItemIn(
            barcode=line.barcode,
            free_text=None if line.barcode else line.product_name,
            name=line.matched_name or line.product_name,
            quantity=line.quantity,
            amount=line.amount,
            unit=line.unit,
            source="mealplan",
        )
        for line in plan.basket
        if not line.optional
    ]
    items, created, merged = await shopping_service.bulk_add(db, user.id, payload)
    return BulkAddOut(added=created, merged=merged, items=await _enrich(db, items))


@router.delete("/{week_start}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(week_start: date, mongo: Mongo, user: CurrentUser) -> None:
    await service.delete_plan(mongo, user.id, week_start)
