"""Premium: who has it, how they get it, and the one free menu a month.

Four features call a paid model — the invented weekly menu, the free-text
assistant, photo recognition and the natural voice. They are Premium (2,99 €/month
or 24,99 €/year, paid on the web through Stripe). Nothing is locked for the
others: each has a free version that costs nothing to run (menus and assistant
from the recipe catalogue, barcode scan, the device's voice).

Stripe is spoken to over plain HTTPS (form-encoded, like its own docs) rather than
through its SDK: three calls and one signature check do not justify the package.
The account is only ever made Premium by the webhook, never by the browser: a
return URL can be typed by anyone, a signed Stripe event cannot.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import time
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.http import get_http_client
from app.domains.users.models import User

logger = logging.getLogger(__name__)

_STRIPE = "https://api.stripe.com/v1"
Plan = Literal["monthly", "yearly"]

# A renewal lands a little after the period ends; don't lock a paying user out
# for the minutes (or the retry day) in between.
_GRACE = timedelta(days=2)
# Stripe statuses that still mean "this person is paying us".
_PAYING = {"active", "trialing", "past_due"}
# Stripe signs each event with a timestamp; older than this is a replay.
_SIGNATURE_TOLERANCE_S = 300


def now() -> datetime:
    return datetime.now(UTC)


def is_premium(user: User) -> bool:
    return user.premium_until is not None and user.premium_until + _GRACE > now()


def checkout_available() -> bool:
    return bool(settings.stripe_secret_key and settings.stripe_price_monthly)


def premium_required() -> HTTPException:
    # 402 is exactly this: the request is fine, it needs a subscription. The web
    # app opens the Premium screen on it; the voice falls back to the device's.
    return HTTPException(
        status.HTTP_402_PAYMENT_REQUIRED,
        "Cette fonction fait partie de Prixes Premium.",
    )


# ── Stripe ───────────────────────────────────────────────────────────────────
async def _stripe(path: str, data: dict[str, str]) -> dict[str, Any]:
    try:
        resp = await get_http_client().post(
            f"{_STRIPE}{path}",
            data=data,
            auth=(settings.stripe_secret_key, ""),
            timeout=20.0,
        )
    except Exception as exc:
        logger.warning(f"Stripe {path} unreachable: {exc}")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Paiement indisponible.") from exc
    if resp.status_code >= 400:
        logger.warning(f"Stripe {path} {resp.status_code}: {resp.text[:300]}")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Paiement indisponible.")
    return dict(resp.json())


async def _customer_for(db: AsyncSession, user: User) -> str:
    if user.stripe_customer_id:
        return user.stripe_customer_id
    customer = await _stripe(
        "/customers", {"email": user.email, "metadata[user_id]": str(user.id)}
    )
    user.stripe_customer_id = str(customer["id"])
    await db.flush()
    return user.stripe_customer_id


async def checkout_url(db: AsyncSession, user: User, plan: Plan) -> str:
    if not checkout_available():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Paiement indisponible.")
    price = settings.stripe_price_yearly if plan == "yearly" else settings.stripe_price_monthly
    if not price:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Offre indisponible.")
    session = await _stripe(
        "/checkout/sessions",
        {
            "mode": "subscription",
            "customer": await _customer_for(db, user),
            "client_reference_id": str(user.id),
            "line_items[0][price]": price,
            "line_items[0][quantity]": "1",
            "locale": "fr",
            "allow_promotion_codes": "true",
            "success_url": f"{settings.billing_return_url}?abonnement=ok",
            "cancel_url": f"{settings.billing_return_url}?abonnement=annule",
        },
    )
    return str(session["url"])


async def portal_url(db: AsyncSession, user: User) -> str:
    if not settings.stripe_secret_key or not user.stripe_customer_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aucun abonnement à gérer.")
    session = await _stripe(
        "/billing_portal/sessions",
        {"customer": user.stripe_customer_id, "return_url": settings.billing_return_url},
    )
    return str(session["url"])


# ── Webhook ──────────────────────────────────────────────────────────────────
def verify_signature(payload: bytes, header: str, secret: str, at: float | None = None) -> bool:
    """Stripe's scheme: HMAC-SHA256 of "<t>.<body>" under the endpoint secret."""
    parts: dict[str, list[str]] = {}
    for item in header.split(","):
        key, _, value = item.strip().partition("=")
        parts.setdefault(key, []).append(value)
    try:
        timestamp = int(parts["t"][0])
    except (KeyError, ValueError, IndexError):
        return False
    if abs((at or time.time()) - timestamp) > _SIGNATURE_TOLERANCE_S:
        return False
    expected = hmac.new(
        secret.encode(), f"{timestamp}.".encode() + payload, hashlib.sha256
    ).hexdigest()
    return any(hmac.compare_digest(expected, sig) for sig in parts.get("v1", []))


def _period_end(subscription: dict[str, Any]) -> datetime | None:
    # Recent API versions moved the period onto the subscription items.
    end = subscription.get("current_period_end")
    if end is None:
        items = (subscription.get("items") or {}).get("data") or []
        ends = [i.get("current_period_end") for i in items if i.get("current_period_end")]
        end = max(ends) if ends else None
    return datetime.fromtimestamp(int(end), UTC) if end else None


async def apply_event(db: AsyncSession, event: dict[str, Any]) -> None:
    """Bring one account in line with a subscription event. Other events are ignored."""
    kind = str(event.get("type", ""))
    if not kind.startswith("customer.subscription."):
        return
    subscription = event.get("data", {}).get("object", {})
    customer = subscription.get("customer")
    if not customer:
        return
    user = await db.scalar(select(User).where(User.stripe_customer_id == str(customer)))
    if user is None:
        logger.warning(f"Stripe event {kind} for unknown customer {customer}")
        return
    paying = kind != "customer.subscription.deleted" and subscription.get("status") in _PAYING
    # A cancelled subscription ends now, grace included: the grace is for late
    # renewals, not for subscriptions that are over.
    user.premium_until = _period_end(subscription) if paying else now() - _GRACE
    logger.info(f"Premium for {user.id}: until {user.premium_until} ({kind})")
