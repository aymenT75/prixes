"""Smart Assistant HTTP API — a sentence becomes a costed basket.

Composing calls a paid model, so it is Premium (billing domain); committing the
result to a shopping list needs an account, because a list belongs to someone.
The rate limiter and the Redis cache on the normalised prompt still bound what a
subscriber can spend.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.core.llm import llm_enabled
from app.core.rate_limit import RateLimit, refund
from app.domains.billing.deps import PremiumUser
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
async def generate(
    request: Request, data: SmartCartIn, db: DbSession, user: PremiumUser
) -> SmartCartOut:
    """Premium: each new sentence is a paid model call. 402 opens the Premium screen.

    A request that comes back with no basket hands its quota back. Otherwise the
    first-time user, whose opening attempts are the most likely to be refused,
    spends the whole hour's budget on refusals and is locked out for having tried.
    """
    try:
        return await service.generate(db, user.id, data)
    except HTTPException:
        await refund(request)
        raise


@router.post("/{draft_id}/commit", response_model=CommitOut, status_code=201)
async def commit(
    draft_id: str, data: CommitIn, db: DbSession, user: CurrentUser
) -> CommitOut:
    """Write the basket, as edited on screen, to the user's shopping list."""
    return await service.commit(db, user.id, draft_id, data.lines)
