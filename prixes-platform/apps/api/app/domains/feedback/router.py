"""Feedback HTTP API — collect user/app feedback (anonymous allowed)."""
from __future__ import annotations

from fastapi import APIRouter, status

from app.core.deps import DbSession, OptionalUser
from app.domains.feedback.models import Feedback
from app.domains.feedback.schemas import FeedbackIn, FeedbackOut

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
