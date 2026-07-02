"""Auth logic: registration, password login, token refresh, Google sign-in."""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_token, hash_password, verify_password
from app.domains.auth.schemas import RegisterIn, TokenPair
from app.domains.users.models import User


def _initials(name: str) -> str:
    parts = [p for p in name.replace("-", " ").split() if p]
    if not parts:
        return "??"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def _tokens(user: User) -> TokenPair:
    return TokenPair(
        access_token=create_token(user.id, "access"),
        refresh_token=create_token(user.id, "refresh"),
    )


async def register(db: AsyncSession, data: RegisterIn) -> TokenPair:
    exists = await db.scalar(select(User).where(User.email == data.email))
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(
        email=data.email.lower(),
        username=data.username,
        initials=_initials(data.username),
        password_hash=hash_password(data.password),
    )
    db.add(user)
    await db.flush()
    return _tokens(user)


async def login(db: AsyncSession, email: str, password: str) -> TokenPair:
    user = await db.scalar(select(User).where(User.email == email.lower()))
    if user is None or not user.password_hash or not verify_password(password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if user.is_banned:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account suspended")
    return _tokens(user)


async def login_google(db: AsyncSession, sub: str, email: str, name: str) -> TokenPair:
    """Find-or-create a user from a verified Google identity (token verified in router)."""
    user = await db.scalar(select(User).where(User.oauth_sub == sub))
    if user is None:
        user = await db.scalar(select(User).where(User.email == email.lower()))
        if user is None:
            user = User(
                email=email.lower(),
                username=name or email.split("@")[0],
                initials=_initials(name or email),
                oauth_provider="google",
                oauth_sub=sub,
                is_verified=True,
            )
            db.add(user)
            await db.flush()
        else:
            user.oauth_provider, user.oauth_sub = "google", sub
    return _tokens(user)


async def login_firebase(
    db: AsyncSession,
    uid: str,
    email: str | None,
    name: str,
    provider: str = "firebase",
    email_verified: bool = False,
) -> TokenPair:
    """Find-or-create a user from a verified Firebase identity (token verified in router).

    Firebase is the identity provider; the Postgres `users` row remains the source of
    truth (deals/votes/shopping/alerts FK to it). Matched by Firebase uid, falling back
    to email so an existing password/Google account links to the same record.
    """
    user = await db.scalar(select(User).where(User.oauth_sub == uid))
    if user is None and email:
        user = await db.scalar(select(User).where(User.email == email.lower()))

    if user is None:
        base = email or f"{uid}@firebase.local"
        user = User(
            email=base.lower(),
            username=name or (email.split("@")[0] if email else "utilisateur"),
            initials=_initials(name or email or "U"),
            oauth_provider=provider,
            oauth_sub=uid,
            is_verified=email_verified,
        )
        db.add(user)
        await db.flush()
    else:
        # Link this Firebase identity to the existing record.
        user.oauth_provider = provider
        user.oauth_sub = uid
        if email_verified:
            user.is_verified = True

    if user.is_banned:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account suspended")
    return _tokens(user)
