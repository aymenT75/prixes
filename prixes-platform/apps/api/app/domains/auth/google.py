"""Verify Google ID tokens against Google's public JWKS (cached)."""
from __future__ import annotations

from typing import Any

import jwt
from fastapi import HTTPException, status
from jwt import PyJWKClient

from app.core.config import settings

_GOOGLE_ISS = {"accounts.google.com", "https://accounts.google.com"}
_jwk_client = PyJWKClient("https://www.googleapis.com/oauth2/v3/certs")


async def verify_google_id_token(id_token: str) -> dict[str, Any]:
    try:
        signing_key = _jwk_client.get_signing_key_from_jwt(id_token)
        claims = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.google_oauth_client_id,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Google token") from exc

    if claims.get("iss") not in _GOOGLE_ISS or not claims.get("email_verified"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unverified Google identity")
    return claims
