"""Smart Assistant HTTP API — a sentence becomes a costed basket.

Authenticated and rate-limited, both on purpose: an open endpoint that calls a
paid model is an open invoice, and per-user limits are only meaningful when there
is a user to attach them to.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
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
async def generate(data: SmartCartIn, db: DbSession, user: CurrentUser) -> SmartCartOut:
    return await service.generate(db, user.id, data)


@router.post("/{draft_id}/commit", response_model=CommitOut, status_code=201)
async def commit(
    draft_id: str, data: CommitIn, db: DbSession, user: CurrentUser
) -> CommitOut:
    """Write the basket, as edited on screen, to the user's shopping list."""
    return await service.commit(db, user.id, draft_id, data.lines)
