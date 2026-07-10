"""Feedback HTTP API — collect (anonymous) + read (admin) user/app feedback."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession, OptionalUser
from app.domains.feedback.models import Feedback
from app.domains.feedback.schemas import (
    FeedbackIn,
    FeedbackItem,
    FeedbackList,
    FeedbackOut,
)

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackOut, status_code=status.HTTP_201_CREATED)
async def submit_feedback(
    data: FeedbackIn, db: DbSession, user: OptionalUser
) -> FeedbackOut:
    """Store a feedback submission. Works for signed-in users and anonymous visitors."""
    entry = Feedback(
        user_id=user.id if user else None,
        rating=data.rating,
        message=data.message.strip(),
        email=(data.email or None),
        page=data.page,
    )
    db.add(entry)
    await db.flush()
    return FeedbackOut(id=str(entry.id))


@router.get("", response_model=FeedbackList)
async def list_feedback(
    db: DbSession,
    user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> FeedbackList:
    """List submissions, newest first, with rating stats. Moderators/admins only."""
    if user.role not in ("moderator", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Moderator role required")

    rows = (
        await db.execute(
            select(Feedback).order_by(Feedback.created_at.desc()).limit(limit)
        )
    ).scalars().all()

    total = (await db.execute(select(func.count(Feedback.id)))).scalar_one()
    avg = (
        await db.execute(select(func.avg(Feedback.rating)))
    ).scalar_one_or_none()
    dist_rows = (
        await db.execute(
            select(Feedback.rating, func.count(Feedback.id))
            .where(Feedback.rating.is_not(None))
            .group_by(Feedback.rating)
        )
    ).all()

    return FeedbackList(
        items=[FeedbackItem.model_validate(r) for r in rows],
        total=int(total),
        average_rating=round(float(avg), 2) if avg is not None else None,
        rating_counts={int(r): int(c) for r, c in dist_rows},
    )
