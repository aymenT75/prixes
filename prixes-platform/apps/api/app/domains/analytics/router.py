"""Analytics HTTP API — record anonymous events + read aggregates (admin)."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession
from app.core.rate_limit import RateLimit
from app.domains.analytics.models import AnalyticsEvent

router = APIRouter(prefix="/analytics", tags=["analytics"])


class EventIn(BaseModel):
    session_id: str = Field(min_length=6, max_length=64)
    event: str = Field(min_length=1, max_length=40)
    path: str | None = Field(default=None, max_length=200)


class PathCount(BaseModel):
    path: str
    count: int


class EventCount(BaseModel):
    event: str
    count: int


class AnalyticsSummary(BaseModel):
    days: int
    total_events: int
    unique_sessions: int
    top_paths: list[PathCount]
    by_event: list[EventCount]


@router.post(
    "/event",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimit("analytics", times=300, window=60))],
)
async def record_event(data: EventIn, db: DbSession) -> Response:
    """Record one anonymous event. Open (no auth) — it carries no personal data."""
    db.add(
        AnalyticsEvent(session_id=data.session_id, event=data.event, path=data.path)
    )
    await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/summary", response_model=AnalyticsSummary)
async def summary(
    db: DbSession,
    user: CurrentUser,
    days: Annotated[int, Query(ge=1, le=90)] = 14,
) -> AnalyticsSummary:
    """Usage aggregates over the last `days`. Moderators/admins only."""
    if user.role not in ("moderator", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Moderator role required")

    since = datetime.now(UTC) - timedelta(days=days)
    base = select(AnalyticsEvent).where(AnalyticsEvent.created_at >= since).subquery()

    total = (await db.execute(select(func.count()).select_from(base))).scalar_one()
    uniq = (
        await db.execute(select(func.count(func.distinct(base.c.session_id))))
    ).scalar_one()

    top_paths = (
        await db.execute(
            select(AnalyticsEvent.path, func.count(AnalyticsEvent.id).label("c"))
            .where(
                AnalyticsEvent.created_at >= since,
                AnalyticsEvent.event == "pageview",
                AnalyticsEvent.path.is_not(None),
            )
            .group_by(AnalyticsEvent.path)
            .order_by(func.count(AnalyticsEvent.id).desc())
            .limit(20)
        )
    ).all()
    by_event = (
        await db.execute(
            select(AnalyticsEvent.event, func.count(AnalyticsEvent.id).label("c"))
            .where(AnalyticsEvent.created_at >= since)
            .group_by(AnalyticsEvent.event)
            .order_by(func.count(AnalyticsEvent.id).desc())
        )
    ).all()

    return AnalyticsSummary(
        days=days,
        total_events=int(total),
        unique_sessions=int(uniq),
        top_paths=[PathCount(path=p, count=int(c)) for p, c in top_paths],
        by_event=[EventCount(event=e, count=int(c)) for e, c in by_event],
    )
