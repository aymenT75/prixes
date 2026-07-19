"""Notification service — turns triggered price alerts into push notifications."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.alerts.models import PriceAlert
from app.domains.devices import service as device_service
from app.domains.notifications import push
from app.domains.products.models import Product


async def notify_price_drops(db: AsyncSession, alerts: list[PriceAlert]) -> int:
    """Send a push to each alert's owner for the products that just dropped.
    Prunes device tokens that FCM reports as invalid. Returns pushes sent."""
    if not alerts:
        return 0

    # Fix N+1 query: batch fetch all products and tokens
    barcodes = [a.barcode for a in alerts]
    user_ids = list(set(a.user_id for a in alerts))

    # Fetch all products at once
    products = (
        await db.execute(select(Product).where(Product.barcode.in_(barcodes)))
    ).scalars().all()
    product_map = {p.barcode: p for p in products}

    # Fetch all tokens at once (per unique user)
    tokens_by_user = {}
    for user_id in user_ids:
        tokens = await device_service.tokens_for_user(db, user_id)
        tokens_by_user[user_id] = tokens

    sent = 0
    for alert in alerts:
        tokens = tokens_by_user.get(alert.user_id, [])
        if not tokens:
            continue
        product = product_map.get(alert.barcode)
        name = (product.name if product else None) or "Un produit suivi"
        price = f"{alert.triggered_price:.2f} €" if alert.triggered_price is not None else ""
        title = "Baisse de prix 🔻"
        body = f"{name} est à {price}" if price else f"{name} a baissé de prix"
        for token in tokens:
            result = await push.send_push(
                token,
                title,
                body,
                {"type": "price_alert", "barcode": alert.barcode},
            )
            if result == "ok":
                sent += 1
            elif result == "invalid":
                await device_service.delete_by_token(db, token)
    return sent
