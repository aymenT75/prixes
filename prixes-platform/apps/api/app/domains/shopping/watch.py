"""Watching the shopping list — the app tells you when your groceries got cheaper.

Nobody has to create an alert: every product on someone's list (not ticked, with
a barcode) is watched. When its best price goes down by enough to matter, the
drop is recorded for the in-app summary ("Depuis votre dernière visite : le café
a baissé de 0,40 €") and the owner's phones get one grouped notification.

State lives in Redis, not in a new table: the last price seen per user and
product, and each user's recent drops. Losing it costs one silent run (the next
one re-learns the prices), never a wrong notification.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import orjson
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import redis_client
from app.domains.alerts.models import PriceAlert
from app.domains.alerts.service import current_best
from app.domains.devices import service as device_service
from app.domains.notifications import push
from app.domains.products.models import Product
from app.domains.shopping.models import ShoppingItem

_SEEN_TTL = 45 * 24 * 3600
_DROPS_TTL = 14 * 24 * 3600
_DROPS_KEPT = 20
# One notification per person at most every 6 hours, and none at night.
_PUSH_GAP = 6 * 3600
_QUIET_BEFORE, _QUIET_FROM = 8, 21
# A drop worth a notification: 10 centimes, or 5 % of the price.
_MIN_EUROS = Decimal("0.10")
_MIN_SHARE = Decimal("0.05")


def _seen_key(user_id: uuid.UUID, barcode: str) -> str:
    return f"watch:seen:{user_id}:{barcode}"


def drops_key(user_id: uuid.UUID) -> str:
    return f"watch:drops:{user_id}"


def worth_telling(before: Decimal, now: Decimal) -> bool:
    drop = before - now
    return drop > 0 and (drop >= _MIN_EUROS or drop >= before * _MIN_SHARE)


def _euros(value: Decimal) -> str:
    return f"{value:.2f}".replace(".", ",") + " €"


def push_text(drops: list[dict[str, Any]]) -> tuple[str, str]:
    """The notification for one person's drops, grouped into a single message."""
    if len(drops) == 1:
        d = drops[0]
        cut = Decimal(d["old"]) - Decimal(d["new"])
        return (
            "Votre liste coûte moins cher",
            f"{d['name']} : {_euros(Decimal(d['new']))} (−{_euros(cut)})",
        )
    names = ", ".join(d["name"] for d in drops[:3])
    rest = len(drops) - 3
    more = f" et {rest} autre{'s' if rest > 1 else ''}" if rest > 0 else ""
    return "Votre liste coûte moins cher", f"{len(drops)} produits ont baissé : {names}{more}"


def _last_sunday(year: int, month: int) -> datetime:
    day = datetime(year, month + 1, 1, tzinfo=UTC) - timedelta(days=1)
    return day - timedelta(days=(day.weekday() + 1) % 7)


def _paris_hour(now: datetime) -> int:
    """French local hour. The EU rule (summer time from the last Sunday of March to
    the last Sunday of October, at 01:00 UTC) rather than zoneinfo: the time-zone
    database is not in every image this runs in."""
    now = now.astimezone(UTC)
    start = _last_sunday(now.year, 3).replace(hour=1)
    end = _last_sunday(now.year, 10).replace(hour=1)
    return (now + timedelta(hours=2 if start <= now < end else 1)).hour


def _quiet_hours(now: datetime) -> bool:
    hour = _paris_hour(now)
    return hour < _QUIET_BEFORE or hour >= _QUIET_FROM


async def recent_drops(user_id: uuid.UUID) -> list[dict[str, Any]]:
    """The last drops recorded for someone, newest first."""
    # redis-py types its list commands as sync-or-async; this client is async.
    raw = await redis_client.lrange(drops_key(user_id), 0, _DROPS_KEPT - 1)  # type: ignore[misc]
    return [orjson.loads(r) for r in raw]


async def watch_lists(db: AsyncSession, now: datetime | None = None) -> dict[str, int]:
    """One pass over every list. Returns counts for the worker log."""
    now = now or datetime.now(UTC)
    rows = (
        await db.execute(
            select(ShoppingItem.user_id, ShoppingItem.barcode, ShoppingItem.name, Product.name)
            .join(Product, Product.barcode == ShoppingItem.barcode)
            .where(ShoppingItem.checked.is_(False), ShoppingItem.barcode.is_not(None))
        )
    ).all()
    # A product with its own alert already gets that alert's notification.
    alerted = {
        (a.user_id, a.barcode)
        for a in (await db.execute(select(PriceAlert).where(PriceAlert.active.is_(True)))).scalars()
    }

    best: dict[str, Decimal | None] = {}
    drops: dict[uuid.UUID, list[dict[str, Any]]] = defaultdict(list)
    watched = 0
    for user_id, barcode, item_name, product_name in rows:
        if barcode is None or (user_id, barcode) in alerted:
            continue
        if barcode not in best:
            best[barcode] = await current_best(db, barcode)
        price = best[barcode]
        if price is None:
            continue
        watched += 1
        key = _seen_key(user_id, barcode)
        seen = await redis_client.get(key)
        await redis_client.set(key, str(price), ex=_SEEN_TTL)
        if seen is None:
            continue  # first sight: learn the price, say nothing
        before = Decimal(seen.decode() if isinstance(seen, bytes) else seen)
        if worth_telling(before, price):
            drops[user_id].append(
                {
                    "barcode": barcode,
                    "name": item_name or product_name or "Un produit",
                    "old": str(before),
                    "new": str(price),
                    "at": now.isoformat(),
                }
            )

    for user_id, found in drops.items():
        key = drops_key(user_id)
        for d in found:
            await redis_client.lpush(key, orjson.dumps(d))  # type: ignore[misc]
        await redis_client.ltrim(key, 0, _DROPS_KEPT - 1)  # type: ignore[misc]
        await redis_client.expire(key, _DROPS_TTL)
    # Everyone with a list, not only today's drops: a drop found at night is
    # told by the first daytime run.
    pushed = 0
    for user_id in {row[0] for row in rows}:
        pushed += await _notify(db, user_id, now)
    return {"watched": watched, "drops": sum(len(v) for v in drops.values()), "pushed": pushed}


async def _notify(db: AsyncSession, user_id: uuid.UUID, now: datetime) -> int:
    """Push the drops not yet notified — unless it is night or one went out recently.
    Those wait in the list and go out with the next daytime run."""
    if _quiet_hours(now):
        return 0
    gate = f"watch:pushed:{user_id}"
    if await redis_client.get(gate):
        return 0
    last = await redis_client.get(f"watch:told:{user_id}")
    told_until = (last.decode() if isinstance(last, bytes) else last) or ""
    fresh = [d for d in await recent_drops(user_id) if d["at"] > told_until]
    if not fresh:
        return 0
    tokens = await device_service.tokens_for_user(db, user_id)
    if not tokens:
        return 0
    title, body = push_text(fresh)
    sent = 0
    for token in tokens:
        result = await push.send_push(token, title, body, {"type": "list_drops"})
        if result == "ok":
            sent += 1
        elif result == "invalid":
            await device_service.delete_by_token(db, token)
    await redis_client.set(gate, "1", ex=_PUSH_GAP)
    await redis_client.set(f"watch:told:{user_id}", fresh[0]["at"], ex=_DROPS_TTL)
    return sent
