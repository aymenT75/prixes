"""Redis fixed-window rate limiting (per-user when authed, else per-IP).

Usage as a route dependency:
    @router.post("/vote", dependencies=[Depends(RateLimit("vote", times=30, window=60))])
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
        except Exception:  # noqa: BLE001 — fall back to IP on any token error
            pass
    fwd = request.headers.get("x-forwarded-for")
    ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "?")
    return f"ip:{ip}"


class RateLimit:
    """Sliding fixed-window limiter: `times` requests per `window` seconds per bucket."""

    def __init__(self, bucket: str, times: int, window: int) -> None:
        self.bucket = bucket
        self.times = times
        self.window = window

    async def __call__(
        self,
        request: Request,
        creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    ) -> None:
        key = f"rl:{self.bucket}:{_client_id(request, creds)}"
        count = await redis_client.incr(key)
        if count == 1:
            await redis_client.expire(key, self.window)
        if count > self.times:
            ttl = await redis_client.ttl(key)
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Trop de requêtes. Réessayez dans {max(ttl, 1)}s.",
                headers={"Retry-After": str(max(ttl, 1))},
            )
