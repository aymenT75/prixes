"""Deals HTTP API — public reads, authenticated writes (replaces Firestore rules)."""
from __future__ import annotations

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import CurrentUser, DbSession
from app.core.rate_limit import RateLimit
from app.domains.deals import service
from app.domains.deals.models import Deal
from app.domains.deals.schemas import DealCreate, DealOut, FeedPage, VoteIn

router = APIRouter(prefix="/deals", tags=["deals"])


@router.get("", response_model=FeedPage)
async def list_deals(
    db: DbSession,
    sort: Annotated[Literal["hot", "new"], Query()] = "hot",
    cursor: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> FeedPage:
    deals, next_cursor = await service.get_feed(db, sort, cursor, limit)
    return FeedPage(
        items=[DealOut.model_validate(d) for d in deals],
        next_cursor=next_cursor,
        sort=sort,
    )


@router.post(
    "",
    response_model=DealOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimit("deal_create", times=10, window=3600))],
)
async def create_deal(data: DealCreate, db: DbSession, user: CurrentUser) -> DealOut:
    deal = await service.create_deal(db, user, data)
    return DealOut.model_validate(deal)


@router.get("/{deal_id}", response_model=DealOut)
async def get_deal(deal_id: uuid.UUID, db: DbSession) -> DealOut:
    deal = await db.get(Deal, deal_id)
    if deal is None or deal.status == "removed":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deal not found")
    return DealOut.model_validate(deal)


@router.post(
    "/{deal_id}/vote",
    response_model=DealOut,
    dependencies=[Depends(RateLimit("vote", times=60, window=60))],
)
async def vote(deal_id: uuid.UUID, body: VoteIn, db: DbSession, user: CurrentUser) -> DealOut:
    deal = await service.cast_vote(db, user, deal_id, body.value)
    return DealOut.model_validate(deal)


@router.delete("/{deal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_deal(deal_id: uuid.UUID, db: DbSession, user: CurrentUser) -> None:
    deal = await db.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deal not found")
    if deal.author_id != user.id and user.role not in ("moderator", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed")
    deal.status = "removed"
