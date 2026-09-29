"""The Sunday menu — next week composed before anyone asks.

For people who turned it on (`auto_week` in their saved questionnaire), the
worker composes the coming week on Sunday evening, stores it like a menu they
made themselves, and sends one notification. On opening the app, the assistant
offers to put its groceries on the list — one "oui".

Allergies and diets come from the copy the app saves with the questionnaire:
the server has no other way to know them, and a menu built without them would
be dangerous rather than merely useless.
"""
from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta

from fastapi import HTTPException
from pymongo.errors import PyMongoError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.mongo import MEAL_PLANS, MongoDb
from app.core.redis import redis_client
from app.domains.billing.service import is_premium
from app.domains.devices import service as device_service
from app.domains.mealplan import service
from app.domains.mealplan.schemas import MealPlanIn, MealPlanOut, MealPreferences
from app.domains.notifications import push
from app.domains.users.models import User

logger = logging.getLogger(__name__)

_READY_TTL = 8 * 24 * 3600


def ready_key(user_id: object) -> str:
    """Set when a Sunday menu is waiting to be looked at: the week it is for."""
    return f"menu:ready:{user_id}"


def next_monday(today: date) -> date:
    """The Monday after `today` — on a Sunday, tomorrow."""
    return today + timedelta(days=7 - today.weekday())


def push_text(week: MealPlanOut) -> tuple[str, str]:
    firsts = " · ".join(f"{m.day_label.capitalize()} : {m.title}" for m in week.meals[:2])
    return (
        "Votre menu de la semaine est prêt",
        f"{firsts}… Ouvrez Prixes pour mettre les courses dans votre liste.",
    )


async def compose_sunday_menus(
    db: AsyncSession, mongo: MongoDb | None, today: date | None = None
) -> dict[str, int]:
    """Compose next week for everyone who asked for it. Counts for the worker log."""
    if mongo is None:
        # Without a document store the menu could not be found again: nothing to offer.
        return {"users": 0, "composed": 0, "pushed": 0}
    today = today or datetime.now(UTC).date()
    week = next_monday(today)
    wants_it = User.meal_preferences["auto_week"].as_boolean().is_(True)
    users = (await db.execute(select(User).where(wants_it))).scalars().all()

    composed = pushed = 0
    for user in users:
        try:
            exists = await mongo[MEAL_PLANS].find_one(
                {"user_id": str(user.id), "week_start": week.isoformat()}, {"_id": 1}
            )
        except PyMongoError as exc:
            logger.warning(f"Sunday menu: cannot read plans: {exc}")
            break
        if exists:
            continue  # they already made next week themselves
        prefs = MealPreferences.model_validate(user.meal_preferences)
        data = MealPlanIn(
            servings=prefs.servings,
            meals_per_day=prefs.meals_per_day,
            budget_eur=prefs.budget_eur,
            goal=prefs.goal,
            equipment=prefs.equipment,
            styles=prefs.styles,
            avoid_allergens=prefs.avoid_allergens,
            diets=prefs.diets,
            week_start=week,
        )
        try:
            plan = await service.generate(db, mongo, user.id, data, use_ai=is_premium(user))
        except HTTPException as exc:
            logger.info(f"Sunday menu not composed for {user.id}: {exc.detail}")
            continue
        composed += 1
        await redis_client.set(ready_key(user.id), week.isoformat(), ex=_READY_TTL)

        title, body = push_text(plan)
        for token in await device_service.tokens_for_user(db, user.id):
            result = await push.send_push(
                token, title, body, {"type": "menu_ready", "week_start": week.isoformat()}
            )
            if result == "ok":
                pushed += 1
            elif result == "invalid":
                await device_service.delete_by_token(db, token)
    return {"users": len(users), "composed": composed, "pushed": pushed}
