"""Password hashing (Argon2) and JWT access/refresh tokens."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import settings

_ph = PasswordHasher()
ALGORITHM = "HS256"
TokenType = Literal["access", "refresh"]


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def create_token(subject: str | uuid.UUID, token_type: TokenType) -> str:
    now = datetime.now(UTC)
    ttl = (
        timedelta(minutes=settings.jwt_access_ttl_minutes)
        if token_type == "access"  # noqa: S105 — a type label ("access"/"refresh"), not a secret
        else timedelta(days=settings.jwt_refresh_ttl_days)
    )
    payload: dict[str, Any] = {
        "sub": str(subject),
        "type": token_type,
        "iat": now,
        "exp": now + ttl,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str, expected_type: TokenType) -> uuid.UUID:
    payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("wrong token type")
    return uuid.UUID(payload["sub"])
