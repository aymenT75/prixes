"""Redis fixed-window rate limiting (per-user when authed, else per-IP).

Usage as a route dependency:
    @router.post("/vote", dependencies=[Depends(RateLimit("vote", times=30, window=60))])

A route whose handler can legitimately produce nothing should call `refund` on
that path — see the module docstring in domains/smartcart/router.py for why a
request that returned no basket must not spend the caller's hourly budget.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.redis import redis_client
from app.core.security import decode_token

_bearer = HTTPBearer(auto_error=False)


def _client_id(request: Request, creds: HTTPAuthorizationCredentials | None) -> str:
    if creds is not None:
        try:
            return f"u:{decode_token(creds.credentials, 'access')}"
        except Exception:  # noqa: BLE001, S110 — fall back to IP on any token error
            pass
    fwd = request.headers.get("x-forwarded-for")
    ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "?")
    return f"ip:{ip}"


def _human_delay(seconds: int) -> str:
    """"3175s" tells nobody anything; "53 minutes" does."""
    if seconds < 90:
        return f"{max(seconds, 1)} secondes"
    minutes = round(seconds / 60)
    if minutes < 60:
        return f"{minutes} minutes"
    hours = round(minutes / 60)
    return "1 heure" if hours == 1 else f"{hours} heures"


async def refund(request: Request) -> None:
    """Give back the quota this request consumed.

    The limiter runs before the handler, so it has already charged the caller by
    the time we discover the request produced nothing. Without this, someone
    whose first few attempts are refused burns their whole hourly budget on
    refusals and is then locked out for an hour for having tried.
    """
    for key in getattr(request.state, "rate_limit_keys", ()):
        try:
            if await redis_client.decr(key) <= 0:
                await redis_client.delete(key)
        except Exception:  # noqa: BLE001, S110 — a lost refund must never fail the response
            pass


class RateLimit:
    """Sliding fixed-window limiter: `times` requests per `window` seconds per bucket."""

    def __init__(self, bucket: str, times: int, window: int) -> None:
        self.bucket = bucket
        self.times = times
        self.window = window

    async def __call__(
        self,
        request: Request,
        creds: HTTPAuthorizationCredentials | None = Depends(_bearer),  # noqa: B008 — FastAPI DI pattern
    ) -> None:
        key = f"rl:{self.bucket}:{_client_id(request, creds)}"
        count = await redis_client.incr(key)
        if count == 1:
            await redis_client.expire(key, self.window)
        if count > self.times:
            ttl = max(await redis_client.ttl(key), 1)
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Trop de demandes d'affilée. Réessayez dans {_human_delay(ttl)}.",
                headers={"Retry-After": str(ttl)},
            )
        # Remembered so a handler that produces nothing can hand the quota back.
        keys = getattr(request.state, "rate_limit_keys", [])
        keys.append(key)
        request.state.rate_limit_keys = keys
