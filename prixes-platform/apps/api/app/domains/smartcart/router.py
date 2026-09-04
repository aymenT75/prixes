"""Smart Assistant HTTP API — a sentence becomes a costed basket.

Composing is open to everyone; committing the result to a shopping list needs an
account, because a list belongs to someone.

That makes the model call reachable without a token, so two things carry the
cost: the rate limiter (per account when signed in, per IP otherwise) and the
Redis cache on the normalised prompt, which answers the repeated questions
without reaching the model at all.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, OptionalUser
from app.core.llm import llm_enabled
from app.core.rate_limit import RateLimit
from app.domains.smartcart import service
from app.domains.smartcart.schemas import CommitIn, CommitOut, SmartCartIn, SmartCartOut

router = APIRouter(prefix="/smart-cart", tags=["smart-cart"])


@router.get("/status")
async def status_() -> dict[str, object]:
    """Whether the assistant can be offered at all — the UI hides itself if not."""
    return {"available": llm_enabled(), "rate_per_hour": settings.smartcart_rate_per_hour}


@router.post(
    "",
    response_model=SmartCartOut,
    dependencies=[
        Depends(
            RateLimit(
                "smartcart",
                times=settings.smartcart_rate_per_hour,
                window=3600,
            )
        )
    ],
)
async def generate(data: SmartCartIn, db: DbSession, user: OptionalUser) -> SmartCartOut:
    """Open to everyone: asking what a raclette costs should not need an account.

    Committing the result does — a shopping list belongs to someone. The rate
    limiter falls back to the caller's IP when there is no token, which is looser
    than a per-account budget; the Redis cache on the normalised prompt is what
    keeps the repeated questions from reaching the model at all.
    """
    return await service.generate(db, user.id if user else None, data)


@router.post("/{draft_id}/commit", response_model=CommitOut, status_code=201)
async def commit(
    draft_id: str, data: CommitIn, db: DbSession, user: CurrentUser
) -> CommitOut:
    """Write the basket, as edited on screen, to the user's shopping list."""
    return await service.commit(db, user.id, draft_id, data.lines)
