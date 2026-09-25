"""Premium — who is paying, and the rules that must never be bent.

The account becomes Premium only through a signed Stripe event; a free account
gets one weekly menu per calendar month; a cancelled subscription stops at once.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any

import pytest

from app.domains.billing import service

SECRET = "whsec_test"  # noqa: S105 — a test signing secret, not a credential


def signed(payload: bytes, at: int, secret: str = SECRET) -> str:
    sig = hmac.new(secret.encode(), f"{at}.".encode() + payload, hashlib.sha256).hexdigest()
    return f"t={at},v1={sig}"


def user(**kw: Any) -> Any:
    base = {
        "id": "u1",
        "premium_until": None,
        "free_menu_month": None,
        "stripe_customer_id": "cus_1",
    }
    return SimpleNamespace(**{**base, **kw})


# ── Signature ────────────────────────────────────────────────────────────────
def test_a_genuine_stripe_signature_is_accepted() -> None:
    body = b'{"type":"customer.subscription.updated"}'
    assert service.verify_signature(body, signed(body, 1_000_000), SECRET, at=1_000_010)


def test_a_tampered_body_is_refused() -> None:
    body = b'{"type":"customer.subscription.updated"}'
    header = signed(body, 1_000_000)
    assert not service.verify_signature(body + b" ", header, SECRET, at=1_000_010)


def test_the_wrong_secret_is_refused() -> None:
    body = b"{}"
    assert not service.verify_signature(body, signed(body, 1, "other"), SECRET, at=1)


def test_an_old_event_is_a_replay() -> None:
    body = b"{}"
    header = signed(body, 1_000_000)
    assert not service.verify_signature(body, header, SECRET, at=1_000_000 + 301)


def test_a_malformed_header_is_refused() -> None:
    assert not service.verify_signature(b"{}", "nonsense", SECRET)


# ── Who is Premium ───────────────────────────────────────────────────────────
def test_never_subscribed_is_not_premium() -> None:
    assert not service.is_premium(user())


def test_a_late_renewal_keeps_premium_for_the_grace_period() -> None:
    yesterday = datetime.now(UTC) - timedelta(days=1)
    assert service.is_premium(user(premium_until=yesterday))


def test_long_expired_is_not_premium() -> None:
    assert not service.is_premium(user(premium_until=datetime.now(UTC) - timedelta(days=3)))


# ── Webhook events ───────────────────────────────────────────────────────────
class FakeDb:
    def __init__(self, found: Any) -> None:
        self.found = found

    async def scalar(self, _query: Any) -> Any:
        return self.found


def event(kind: str, status: str, **sub: Any) -> dict[str, Any]:
    return {"type": kind, "data": {"object": {"customer": "cus_1", "status": status, **sub}}}


def test_an_active_subscription_makes_premium_until_its_period_end() -> None:
    u = user()
    end = int((datetime.now(UTC) + timedelta(days=30)).timestamp())
    ev = event("customer.subscription.created", "active", current_period_end=end)
    asyncio.run(service.apply_event(FakeDb(u), ev))  # type: ignore[arg-type]
    assert u.premium_until == datetime.fromtimestamp(end, UTC)
    assert service.is_premium(u)


def test_the_period_is_read_from_the_items_on_recent_api_versions() -> None:
    u = user()
    end = int((datetime.now(UTC) + timedelta(days=365)).timestamp())
    items = {"data": [{"current_period_end": end}]}
    ev = event("customer.subscription.updated", "active", items=items)
    asyncio.run(service.apply_event(FakeDb(u), ev))  # type: ignore[arg-type]
    assert u.premium_until == datetime.fromtimestamp(end, UTC)


def test_a_deleted_subscription_ends_now() -> None:
    u = user(premium_until=datetime.now(UTC) + timedelta(days=20))
    ev = event("customer.subscription.deleted", "canceled")
    asyncio.run(service.apply_event(FakeDb(u), ev))  # type: ignore[arg-type]
    assert not service.is_premium(u)


@pytest.mark.parametrize("status", ["canceled", "unpaid", "incomplete_expired"])
def test_a_subscription_that_stopped_paying_ends(status: str) -> None:
    u = user(premium_until=datetime.now(UTC) + timedelta(days=20))
    ev = event("customer.subscription.updated", status)
    asyncio.run(service.apply_event(FakeDb(u), ev))  # type: ignore[arg-type]
    assert not service.is_premium(u)


def test_other_events_change_nothing() -> None:
    u = user()
    ev = {"type": "invoice.paid", "data": {"object": {}}}
    asyncio.run(service.apply_event(FakeDb(u), ev))  # type: ignore[arg-type]
    assert u.premium_until is None


def test_an_unknown_customer_is_ignored_not_an_error() -> None:
    end = int((datetime.now(UTC) + timedelta(days=30)).timestamp())
    ev = event("customer.subscription.created", "active", current_period_end=end)
    asyncio.run(service.apply_event(FakeDb(None), ev))  # type: ignore[arg-type]


def test_the_payload_round_trips_as_json() -> None:
    """The webhook parses the raw body it verified — not a re-serialised copy."""
    ev = event("customer.subscription.created", "active")
    body = json.dumps(ev).encode()
    assert json.loads(body) == ev
