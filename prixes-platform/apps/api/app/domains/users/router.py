"""Users HTTP API — profile, public profile, and GDPR self-service."""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update

from app.core.deps import CurrentUser, DbSession
from app.domains.deals.models import Deal, Vote
from app.domains.users.models import User

router = APIRouter(prefix="/users", tags=["users"])


class UserMe(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: str
    username: str
    initials: str
    reputation: int
    deals_count: int
    votes_received: int
    role: str
    is_verified: bool


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    username: str
    initials: str
    reputation: int
    deals_count: int


class UserUpdate(BaseModel):
    username: str = Field(min_length=2, max_length=64, pattern=r"^[\w. -]+$")


def _derive_initials(username: str) -> str:
    parts = username.replace("_", " ").replace(".", " ").split()
    if len(parts) >= 2:
        return (parts[0][0] + parts[1][0]).upper()
    return username[:2].upper()


@router.get("/me", response_model=UserMe)
async def me(user: CurrentUser) -> UserMe:
    return UserMe.model_validate(user)


@router.patch("/me", response_model=UserMe)
async def update_me(body: UserUpdate, user: CurrentUser, db: DbSession) -> UserMe:
    user.username = body.username.strip()
    user.initials = _derive_initials(user.username)
    return UserMe.model_validate(user)


@router.get("/me/export", response_model=dict)
async def export_my_data(user: CurrentUser, db: DbSession) -> dict[str, Any]:
    """GDPR Art. 20 — return all personal data we hold for this user as JSON."""
    deals = (await db.execute(select(Deal).where(Deal.author_id == user.id))).scalars().all()
    votes = (await db.execute(select(Vote).where(Vote.user_id == user.id))).scalars().all()
    return {
        "profile": UserMe.model_validate(user).model_dump(mode="json"),
        "deals": [
            {"id": str(d.id), "title": d.title, "created_at": d.created_at.isoformat()}
            for d in deals
        ],
        "votes": [{"deal_id": str(v.deal_id), "value": v.value} for v in votes],
    }


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(user: CurrentUser, db: DbSession) -> None:
    """GDPR Art. 17 — erase the account. Authored deals are anonymised, not deleted,
    to preserve community price history; PII is removed."""
    await db.execute(
        update(Deal).where(Deal.author_id == user.id).values(status="removed")
    )
    user.email = f"deleted-{user.id}@anonymous.invalid"
    user.username = "Compte supprimé"
    user.initials = "··"
    user.password_hash = None
    user.oauth_provider = None
    user.oauth_sub = None
    user.is_banned = True


@router.get("/{user_id}", response_model=UserPublic)
async def public_profile(user_id: uuid.UUID, db: DbSession) -> UserPublic:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return UserPublic.model_validate(user)
