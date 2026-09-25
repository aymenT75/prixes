"""Premium HTTP API: status, checkout, self-service portal, Stripe webhook."""
from __future__ import annotations

import json
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.domains.billing import service

router = APIRouter(prefix="/billing", tags=["billing"])


class BillingStatus(BaseModel):
    premium: bool
    premium_until: datetime | None
    # False while Stripe isn't configured: the page then says "bientôt" instead of
    # offering a button that would fail.
    checkout_available: bool
    can_manage: bool


class CheckoutIn(BaseModel):
    plan: Literal["monthly", "yearly"] = "monthly"


class UrlOut(BaseModel):
    url: str


@router.get("/status", response_model=BillingStatus)
async def billing_status(user: CurrentUser) -> BillingStatus:
    return BillingStatus(
        premium=service.is_premium(user),
        premium_until=user.premium_until,
        checkout_available=service.checkout_available(),
        can_manage=bool(user.stripe_customer_id and settings.stripe_secret_key),
    )


@router.post("/checkout", response_model=UrlOut)
async def checkout(data: CheckoutIn, db: DbSession, user: CurrentUser) -> UrlOut:
    """A Stripe-hosted payment page. Premium itself arrives by webhook, not here."""
    return UrlOut(url=await service.checkout_url(db, user, data.plan))


@router.post("/portal", response_model=UrlOut)
async def portal(db: DbSession, user: CurrentUser) -> UrlOut:
    """Stripe's own page to change plan, update the card or cancel."""
    return UrlOut(url=await service.portal_url(db, user))


@router.post("/webhook", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False)
async def webhook(request: Request, db: DbSession) -> None:
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    if not settings.stripe_webhook_secret or not service.verify_signature(
        payload, signature, settings.stripe_webhook_secret
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Signature invalide.")
    await service.apply_event(db, json.loads(payload))
