"""Verify Firebase ID tokens against Google's securetoken JWKS (cached).

We do NOT use the firebase-admin SDK (it needs a service-account key and is heavy).
A Firebase ID token is a standard RS256 JWT signed by Google; verifying it against
the public securetoken JWKS + checking iss/aud is exactly what firebase-admin does
under the hood. Keys are cached by PyJWKClient.
"""
from __future__ import annotations

from typing import Any

import jwt
from fastapi import HTTPException, status
from jwt import PyJWKClient

from app.core.config import settings

# Google's public keys for Firebase Auth ("Secure Token Service").
_FIREBASE_JWKS = (
    "https://www.googleapis.com/service_accounts/v1/jwk/"
    "securetoken@system.gserviceaccount.com"
)
_jwk_client = PyJWKClient(_FIREBASE_JWKS)


async def verify_firebase_id_token(id_token: str) -> dict[str, Any]:
    project = settings.firebase_project_id
    if not project:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, "Firebase not configured"
        )
    try:
        signing_key = _jwk_client.get_signing_key_from_jwt(id_token)
        claims = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=project,
            issuer=f"https://securetoken.google.com/{project}",
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Firebase token") from exc

    if not claims.get("sub"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Firebase identity")
    return claims
