"""Smart Assistant HTTP API — a sentence becomes a costed basket.

Free text calls a paid model, so it is Premium (billing domain). Everyone else
still gets an answer when the request names a dish of the recipe catalogue
("une raclette pour 6") — no model, no cost. Committing the result to a shopping
list needs an account, because a list belongs to someone.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession, OptionalUser
from app.core.llm import llm_enabled
from app.core.rate_limit import RateLimit, refund
from app.domains.billing.service import is_premium
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
    request: Request, data: SmartCartIn, db: DbSession, user: OptionalUser
) -> SmartCartOut:
    """Premium: any sentence, read by the model. Everyone else: the catalogue
    recipe the sentence names — never a locked door.

    A request that comes back with no basket hands its quota back. Otherwise the
    first-time user, whose opening attempts are the most likely to be refused,
    spends the whole hour's budget on refusals and is locked out for having tried.
    """
    try:
        if user is not None and is_premium(user):
            return await service.generate(db, user.id, data)
        return await service.generate_from_catalog(db, user.id if user else None, data)
    except HTTPException:
        await refund(request)
        raise


@router.post("/{draft_id}/commit", response_model=CommitOut, status_code=201)
async def commit(
    draft_id: str, data: CommitIn, db: DbSession, user: CurrentUser
) -> CommitOut:
    """Write the basket, as edited on screen, to the user's shopping list."""
    return await service.commit(db, user.id, draft_id, data.lines)
