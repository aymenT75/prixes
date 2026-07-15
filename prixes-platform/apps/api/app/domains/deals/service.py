"""Deal business logic: create, vote (dedup + ranking), and ranked feed reads."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ranking import hot_score
from app.core.redis import FEED_HOT, FEED_NEW, redis_client
from app.domains.deals.models import Deal, Vote
from app.domains.deals.schemas import DealCreate
from app.domains.users.models import User


async def create_deal(db: AsyncSession, author: User, data: DealCreate) -> Deal:
    deal = Deal(
        author_id=author.id,
        title=data.title,
        description=data.description,
        store=data.store,
        category=data.category,
        price_now=data.price_now,
        price_before=data.price_before,
        link=str(data.link) if data.link else None,
        photo_url=data.photo_url,
        expires_at=data.expires_at,
    )
    deal.score = hot_score(0, 0, datetime.now(UTC))
    db.add(deal)
    author.deals_count += 1
    await db.flush()

    # Index into ranked feeds (Sorted Sets) — read path never touches the DB on a hit.
    await redis_client.zadd(FEED_HOT, {str(deal.id): deal.score})
    await redis_client.zadd(FEED_NEW, {str(deal.id): deal.created_at.timestamp()})
    return deal


async def cast_vote(db: AsyncSession, voter: User, deal_id: uuid.UUID, value: int) -> Deal:
    deal = await db.get(Deal, deal_id)
    if deal is None or deal.status != "active":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deal not found")

    # Upsert one vote per (user, deal); compute delta vs any previous vote.
    existing = await db.get(Vote, (voter.id, deal_id))
    prev = existing.value if existing else 0
    if prev == value:
        return deal  # idempotent re-vote

    stmt = (
        pg_insert(Vote)
        .values(user_id=voter.id, deal_id=deal_id, value=value, created_at=datetime.now(UTC))
        .on_conflict_do_update(
            index_elements=["user_id", "deal_id"],
            set_={"value": value, "created_at": datetime.now(UTC)},
        )
    )
    await db.execute(stmt)

    # Adjust aggregate counters by the delta between previous and new vote.
    deal.votes_up += (value == 1) - (prev == 1)
    deal.votes_down += (value == -1) - (prev == -1)
    deal.score = hot_score(deal.votes_up, deal.votes_down, deal.created_at)
    await db.flush()

    await redis_client.zadd(FEED_HOT, {str(deal.id): float(deal.score)})
    return deal


async def get_feed(
    db: AsyncSession, sort: str = "hot", cursor: int = 0, limit: int = 20
) -> tuple[list[Deal], int | None]:
    key = {"hot": FEED_HOT, "new": FEED_NEW}.get(sort, FEED_HOT)
    ids = await redis_client.zrevrange(key, cursor, cursor + limit - 1)

    if not ids:  # cold cache → fall back to DB and warm the set
        rows = (
            await db.execute(
                select(Deal)
                .where(Deal.status == "active")
                .order_by(Deal.score.desc())
                .offset(cursor)
                .limit(limit)
            )
        ).scalars().all()
        return list(rows), (cursor + limit if len(rows) == limit else None)

    deals = list(
        (
            await db.execute(select(Deal).where(Deal.id.in_([uuid.UUID(i) for i in ids])))
        ).scalars().all()
    )
    order = {i: n for n, i in enumerate(ids)}
    deals.sort(key=lambda d: order[str(d.id)])
    next_cursor = cursor + limit if len(ids) == limit else None
    return deals, next_cursor
