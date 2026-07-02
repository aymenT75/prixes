"""Moderation — users report deals; moderators review and act."""
from __future__ import annotations

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.core.rate_limit import RateLimit
from app.domains.deals.models import Deal, Report

router = APIRouter(prefix="/moderation", tags=["moderation"])

Reason = Literal["spam", "expired", "wrong_price", "abuse", "other"]


class ReportIn(BaseModel):
    deal_id: uuid.UUID
    reason: Reason
    note: str | None = Field(default=None, max_length=500)


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    deal_id: uuid.UUID
    reason: str
    status: str


def _require_moderator(user: CurrentUser) -> None:
    if user.role not in ("moderator", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Moderator role required")


@router.post(
    "/reports",
    response_model=ReportOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimit("report", times=20, window=3600))],
)
async def report_deal(body: ReportIn, db: DbSession, user: CurrentUser) -> ReportOut:
    if await db.get(Deal, body.deal_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deal not found")
    report = Report(
        deal_id=body.deal_id, reporter_id=user.id, reason=body.reason, note=body.note
    )
    db.add(report)
    await db.flush()
    return ReportOut.model_validate(report)


@router.get("/reports", response_model=list[ReportOut])
async def list_open_reports(db: DbSession, user: CurrentUser) -> list[ReportOut]:
    _require_moderator(user)
    rows = (
        await db.execute(select(Report).where(Report.status == "open").limit(100))
    ).scalars().all()
    return [ReportOut.model_validate(r) for r in rows]


@router.post("/reports/{report_id}/resolve", response_model=ReportOut)
async def resolve_report(
    report_id: uuid.UUID,
    action: Annotated[Literal["remove", "dismiss"], Query()],
    db: DbSession,
    user: CurrentUser,
) -> ReportOut:
    _require_moderator(user)
    report = await db.get(Report, report_id)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    if action == "remove":
        deal = await db.get(Deal, report.deal_id)
        if deal is not None:
            deal.status = "removed"
        report.status = "resolved"
    else:
        report.status = "dismissed"
    await db.flush()
    return ReportOut.model_validate(report)
