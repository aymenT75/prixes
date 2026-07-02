"""Auth HTTP API — email/password + Google, mirroring the old Firebase auth."""
from __future__ import annotations

import jwt
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.deps import DbSession
from app.core.rate_limit import RateLimit
from app.core.security import create_token, decode_token
from app.domains.auth import service
from app.domains.auth.schemas import (
    FirebaseIn,
    GoogleIn,
    LoginIn,
    RefreshIn,
    RegisterIn,
    TokenPair,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterIn, db: DbSession) -> TokenPair:
    return await service.register(db, data)


@router.post(
    "/login",
    response_model=TokenPair,
    dependencies=[Depends(RateLimit("login", times=10, window=300))],
)
async def login(data: LoginIn, db: DbSession) -> TokenPair:
    return await service.login(db, data.email, data.password)


@router.post("/refresh", response_model=TokenPair)
async def refresh(data: RefreshIn) -> TokenPair:
    try:
        user_id = decode_token(data.refresh_token, "refresh")
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token") from exc
    return TokenPair(
        access_token=create_token(user_id, "access"),
        refresh_token=create_token(user_id, "refresh"),
    )


@router.post("/google", response_model=TokenPair)
async def google(data: GoogleIn, db: DbSession) -> TokenPair:
    # NOTE: verify the Google ID token against Google's JWKS before trusting claims.
    # Implemented in worker/auth utils; placeholder extraction shown here.
    from app.domains.auth.google import verify_google_id_token

    claims = await verify_google_id_token(data.id_token)
    return await service.login_google(
        db, sub=claims["sub"], email=claims["email"], name=claims.get("name", "")
    )


@router.post(
    "/firebase",
    response_model=TokenPair,
    dependencies=[Depends(RateLimit("firebase", times=20, window=300))],
)
async def firebase(data: FirebaseIn, db: DbSession) -> TokenPair:
    """Exchange a verified Firebase ID token for our own JWT pair."""
    from app.domains.auth.firebase import verify_firebase_id_token

    claims = await verify_firebase_id_token(data.id_token)
    provider = (claims.get("firebase") or {}).get("sign_in_provider", "firebase")
    return await service.login_firebase(
        db,
        uid=claims["sub"],
        email=claims.get("email"),
        name=claims.get("name", ""),
        provider=provider,
        email_verified=bool(claims.get("email_verified")),
    )
