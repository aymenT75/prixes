"""Weekly meal plan HTTP API."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.core.mongo import Mongo, OptionalMongo
from app.core.rate_limit import RateLimit
from app.domains.billing import service as billing
from app.domains.mealplan import images, service
from app.domains.mealplan.schemas import MealPlanIn, MealPlanOut, MealPreferences, RegenerateIn
from app.domains.shopping import service as shopping_service
from app.domains.shopping.router import _enrich
from app.domains.shopping.schemas import BulkAddOut, ShoppingItemIn

router = APIRouter(prefix="/meal-plan", tags=["meal-plan"])

# A week is a much larger generation than a single basket, so it gets its own,
# tighter budget rather than sharing the smart-cart bucket.
_LIMIT = Depends(RateLimit("mealplan", times=settings.mealplan_rate_per_day, window=86400))


class PhotoIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class PhotoOut(BaseModel):
    url: str | None


# Generous for a person (a week is 7-14 dishes, plus redos), tight for a script.
_PHOTO_LIMIT = Depends(RateLimit("mealimg", times=60, window=86400))


@router.post("/photo", response_model=PhotoOut, dependencies=[_PHOTO_LIMIT])
async def photo(data: PhotoIn, user: CurrentUser) -> PhotoOut:
    """The photo of a dish — drawn on first request, then served from disk.
    `url` is null when there is no photo to be had; the page shows an icon."""
    return PhotoOut(url=await images.photo_for(data.title))


@router.get("/images/{name}", response_class=FileResponse)
async def image_file(name: str) -> FileResponse:
    """Public and static: it only serves photos that already exist, never draws
    one, so an <img> can load it without a token."""
    key, _, ext = name.partition(".")
    if ext not in images.FORMATS or not images.KEY_PATTERN.match(key):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo introuvable.")
    path = images.image_path(key, ext)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo introuvable.")
    # A key is a hash of the title: the file behind it never changes.
    return FileResponse(
        path,
        media_type=images.FORMATS[ext],
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.get("/preferences", response_model=MealPreferences | None)
async def get_preferences(user: CurrentUser) -> MealPreferences | None:
    """The questionnaire's answers — null until it has been answered once, which
    is how the page knows to show the questionnaire rather than the summary."""
    if user.meal_preferences is None:
        return None
    return MealPreferences.model_validate(user.meal_preferences)


@router.put("/preferences", response_model=MealPreferences)
async def put_preferences(data: MealPreferences, user: CurrentUser) -> MealPreferences:
    user.meal_preferences = data.model_dump(mode="json")
    return data


@router.get("", response_model=MealPlanOut | None)
async def current(
    db: DbSession,
    mongo: OptionalMongo,
    user: CurrentUser,
    week_start: date | None = None,
) -> MealPlanOut | None:
    """The plan for a week, re-priced at read time — prices move, menus don't."""
    return await service.get_current(db, mongo, user.id, week_start)


@router.post("", response_model=MealPlanOut, status_code=201, dependencies=[_LIMIT])
async def generate(
    data: MealPlanIn, db: DbSession, mongo: OptionalMongo, user: CurrentUser
) -> MealPlanOut:
    """Premium: a week invented by the model. Everyone else: a week drawn from the
    recipe catalogue — free, unlimited, priced and compared the same way."""
    return await service.generate(db, mongo, user.id, data, use_ai=billing.is_premium(user))


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
    """Swap one meal without touching the rest of the week — an invented dish for
    Premium, another catalogue recipe for everyone else."""
    return await service.regenerate_meal(
        db, mongo, user.id, week_start, day, slot, data.note,
        use_ai=billing.is_premium(user),
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
