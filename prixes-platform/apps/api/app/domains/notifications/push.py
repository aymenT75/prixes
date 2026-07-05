"""Firebase Cloud Messaging (HTTP v1) push sender.

Uses a Google service account to mint an OAuth2 access token (service-account JWT
bearer grant, signed RS256 with PyJWT — already a dependency via Firebase Auth) and
POSTs to the FCM v1 endpoint. No firebase-admin dependency. APNs is delivered by FCM.

Push is optional: if no service account is configured, `send_push` returns "disabled"
and callers simply skip push (in-app + email alerts still work).
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Literal

import jwt

from app.core.config import settings
from app.core.http import get_http_client

SendResult = Literal["ok", "invalid", "error", "disabled"]

_OAUTH_URL = "https://oauth2.googleapis.com/token"
_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"

# Cached OAuth access token (valid ~1h).
_access_token: str | None = None
_access_exp: int = 0


def _load_service_account() -> dict[str, Any] | None:
    """Read the service-account credential from a file path or inline JSON."""
    raw: str | None = None
    if settings.firebase_service_account_file:
        try:
            raw = Path(settings.firebase_service_account_file).read_text("utf-8")
        except OSError:
            return None
    elif settings.firebase_service_account_json:
        raw = settings.firebase_service_account_json
    if raw is None:
        return None
    try:
        data: Any = json.loads(raw)
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


async def _get_access_token(sa: dict[str, Any]) -> str | None:
    global _access_token, _access_exp
    now = int(time.time())
    if _access_token and _access_exp - 60 > now:
        return _access_token

    try:
        assertion = jwt.encode(
            {
                "iss": sa["client_email"],
                "scope": _SCOPE,
                "aud": sa.get("token_uri", _OAUTH_URL),
                "iat": now,
                "exp": now + 3600,
            },
            sa["private_key"],
            algorithm="RS256",
        )
    except (KeyError, ValueError):
        return None

    resp = await get_http_client().post(
        sa.get("token_uri", _OAUTH_URL),
        data={
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": assertion,
        },
    )
    if resp.status_code != 200:
        return None
    data = resp.json()
    _access_token = data.get("access_token")
    _access_exp = now + int(data.get("expires_in", 3600))
    return _access_token


async def send_push(
    token: str,
    title: str,
    body: str,
    data: dict[str, str] | None = None,
) -> SendResult:
    """Send one notification. Returns "invalid" when FCM reports the token is stale
    (caller should delete it), "ok" on success, "disabled" when push isn't configured."""
    sa = _load_service_account()
    if sa is None:
        return "disabled"
    access = await _get_access_token(sa)
    if access is None:
        return "error"

    project_id = sa.get("project_id") or settings.firebase_project_id
    url = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
    message: dict[str, Any] = {
        "token": token,
        "notification": {"title": title, "body": body},
    }
    if data:
        message["data"] = {k: str(v) for k, v in data.items()}

    resp = await get_http_client().post(
        url,
        json={"message": message},
        headers={"Authorization": f"Bearer {access}"},
    )
    if resp.status_code == 200:
        return "ok"
    # 404 UNREGISTERED / 400 INVALID_ARGUMENT (bad token) → prune it.
    if resp.status_code in (400, 404):
        return "invalid"
    return "error"
