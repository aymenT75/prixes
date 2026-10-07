"""Shopping-list HTTP API — per-user list + basket optimizer."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.core.redis import redis_client
from app.domains.mealplan.auto import ready_key
from app.domains.products.models import PricePoint, Product
from app.domains.shopping import budget, service, share
from app.domains.shopping.models import ShoppingItem
from app.domains.shopping.schemas import (
    BudgetIn,
    BudgetOut,
    BulkAddIn,
    BulkAddOut,
    DropOut,
    JoinIn,
    NewsOut,
    ShareOut,
    ShoppingItemIn,
    ShoppingItemOut,
    ShoppingItemUpdate,
    ShoppingListOut,
    SplitResult,
    TripIn,
)
from app.domains.shopping.watch import recent_drops

router = APIRouter(prefix="/shopping", tags=["shopping"])
# Its own router, included before `router`: "/shopping/share" must not be taken
# for "/shopping/{item_id}".
share_router = APIRouter(prefix="/shopping/share", tags=["shopping"])
# The month's spending against the budget, per list (a family shares it).
budget_router = APIRouter(prefix="/shopping/budget", tags=["shopping"])


async def _enrich(
    db: DbSession, items: list[ShoppingItem], reader: uuid.UUID | None = None
) -> list[ShoppingItemOut]:
    out: list[ShoppingItemOut] = []
    # Who else touched these lines, named once for the whole list.
    others = {
        uid
        for it in items
        for uid in (it.added_by, it.checked_by)
        if uid is not None and uid != reader
    }
    people = await share.names(db, others) if reader is not None else {}
    for it in items:
        dto = ShoppingItemOut.model_validate(it)
        if it.added_by in people:
            dto.added_by_name = people[it.added_by].username
        if it.checked and it.checked_by in people:
            dto.checked_by_name = people[it.checked_by].username
        # A free-text line has no barcode, so no product and no price to look up.
        if it.barcode:
            product = await db.get(Product, it.barcode)
            best = (
                await db.execute(
                    select(PricePoint.price)
                    .where(PricePoint.barcode == it.barcode)
                    .order_by(PricePoint.price.asc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            dto.image_url = product.image_url if product else None
            dto.best_price = best
            dto.nutriscore = product.nutriscore if product else None
            dto.pack = product.quantity if product else None
        out.append(dto)
    return out


@router.get("", response_model=ShoppingListOut)
async def get_list(db: DbSession, user: CurrentUser) -> ShoppingListOut:
    owner = await share.list_owner(db, user.id)
    items = await service.list_items(db, owner)
    enriched = await _enrich(db, items, user.id)
    return ShoppingListOut(items=enriched, total=len(enriched))


@router.get("/news", response_model=NewsOut)
async def news(user: CurrentUser) -> NewsOut:
    """What happened while the app was closed: the list's recent price drops and
    a Sunday menu waiting to be looked at. The app says it when it opens."""
    ready = await redis_client.get(ready_key(user.id))
    return NewsOut(
        drops=[DropOut(**d) for d in await recent_drops(user.id)],
        menu_ready=(ready.decode() if isinstance(ready, bytes) else ready) or None,
    )


@router.post("/news/menu-seen", status_code=204)
async def menu_seen(user: CurrentUser) -> None:
    """The Sunday menu was offered: don't offer it again at every opening."""
    await redis_client.delete(ready_key(user.id))


@router.post("", response_model=ShoppingItemOut, status_code=201)
async def add(data: ShoppingItemIn, db: DbSession, user: CurrentUser) -> ShoppingItemOut:
    owner = await share.list_owner(db, user.id)
    item = await service.add_item(db, owner, data, user.id)
    await share.tell_others(db, owner, user.id, [item.label])
    return (await _enrich(db, [item], user.id))[0]


@router.post("/bulk", response_model=BulkAddOut, status_code=201)
async def bulk_add(data: BulkAddIn, db: DbSession, user: CurrentUser) -> BulkAddOut:
    """Add a whole basket in one call — the assistant and the meal planner."""
    owner = await share.list_owner(db, user.id)
    items, created, merged = await service.bulk_add(db, owner, data.items, user.id)
    await share.tell_others(db, owner, user.id, [i.label for i in items])
    return BulkAddOut(added=created, merged=merged, items=await _enrich(db, items, user.id))


@router.patch("/{item_id}", response_model=ShoppingItemOut)
async def update(
    item_id: uuid.UUID, data: ShoppingItemUpdate, db: DbSession, user: CurrentUser
) -> ShoppingItemOut:
    owner = await share.list_owner(db, user.id)
    item = await service.update_item(db, owner, item_id, data, user.id)
    return (await _enrich(db, [item], user.id))[0]


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(item_id: uuid.UUID, db: DbSession, user: CurrentUser) -> None:
    await service.delete_item(db, await share.list_owner(db, user.id), item_id)


@router.post("/clear-checked")
async def clear_checked(db: DbSession, user: CurrentUser) -> dict[str, int]:
    removed = await service.clear_checked(db, await share.list_owner(db, user.id))
    return {"removed": removed}


@router.get("/split", response_model=SplitResult)
async def split(
    db: DbSession,
    user: CurrentUser,
    max_stores: Annotated[int, Query(ge=1, le=3)] = 2,
) -> SplitResult:
    """One trolley per store: what to buy where, and what the second stop saves."""
    return await service.split(db, await share.list_owner(db, user.id), max_stores)




# ── Liste partagée ──────────────────────────────────────────────────────────
@share_router.get("", response_model=ShareOut)
async def share_state(db: DbSession, user: CurrentUser) -> ShareOut:
    """Who is on the list the user works on, and the invite code if it is theirs."""
    return ShareOut.model_validate(await share.share_state(db, user.id))


@share_router.post("/code", response_model=ShareOut)
async def share_code(db: DbSession, user: CurrentUser) -> ShareOut:
    """Create (or replace) the code that lets someone join the user's list."""
    await share.create_code(db, user.id)
    return ShareOut.model_validate(await share.share_state(db, user.id))


@share_router.get("/preview")
async def share_preview(code: str, db: DbSession, user: CurrentUser) -> dict[str, str]:
    return {"owner_name": await share.preview(db, code)}


@share_router.post("/join", response_model=ShareOut)
async def share_join(data: JoinIn, db: DbSession, user: CurrentUser) -> ShareOut:
    await share.join(db, user.id, data.code)
    return ShareOut.model_validate(await share.share_state(db, user.id))


@share_router.delete("", response_model=ShareOut)
async def share_leave(db: DbSession, user: CurrentUser) -> ShareOut:
    """A member leaves the list; the owner stops sharing it."""
    await share.leave(db, user.id)
    return ShareOut.model_validate(await share.share_state(db, user.id))


@share_router.delete("/members/{member_id}", response_model=ShareOut)
async def share_remove(member_id: uuid.UUID, db: DbSession, user: CurrentUser) -> ShareOut:
    await share.remove_member(db, user.id, member_id)
    return ShareOut.model_validate(await share.share_state(db, user.id))


# ── Budget du mois ──────────────────────────────────────────────────────────
@budget_router.get("", response_model=BudgetOut)
async def get_budget(db: DbSession, user: CurrentUser) -> BudgetOut:
    """This month: spent, saved, number of shops, and the budget if one is set."""
    return await budget.summary(db, await share.list_owner(db, user.id))


@budget_router.put("", response_model=BudgetOut)
async def put_budget(body: BudgetIn, db: DbSession, user: CurrentUser) -> BudgetOut:
    owner = await share.list_owner(db, user.id)
    await budget.set_monthly(db, owner, body.monthly)
    return await budget.summary(db, owner)


@budget_router.post("/trips", response_model=BudgetOut, status_code=201)
async def add_trip(body: TripIn, db: DbSession, user: CurrentUser) -> BudgetOut:
    """Record a finished shop (end of the in-store guide)."""
    owner = await share.list_owner(db, user.id)
    await budget.record_trip(db, owner, user.id, body)
    return await budget.summary(db, owner)
