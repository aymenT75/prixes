"""Shared FastAPI dependencies — current user resolution from a Bearer token."""
from __future__ import annotations

from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import decode_token
from app.domains.users.models import User

_bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DbSession,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        user_id = decode_token(creds.credentials, "access")
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token") from exc

    user = await db.get(User, user_id)
    if user is None or user.is_banned:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Inactive or unknown user")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_optional_user(
    db: DbSession,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User | None:
    if creds is None:
        return None
    try:
        return await get_current_user(db, creds)
    except HTTPException:
        return None


OptionalUser = Annotated[User | None, Depends(get_optional_user)]
