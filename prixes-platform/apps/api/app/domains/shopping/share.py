"""A shopping list shared with family.

The owner's list is the shared one: members read and write it instead of their
own, which is set aside (not deleted) and comes back if they leave. Joining takes
a six-character code — short enough to read out over the phone to someone who is
not at ease with links, which is the person this feature is for.
"""
from __future__ import annotations

import asyncio
import logging
import secrets
import uuid

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.devices import service as device_service
from app.domains.notifications import push
from app.domains.shopping.models import ListInvite, ListMember, ShoppingBudget, ShoppingTrip
from app.domains.users.models import User

log = logging.getLogger(__name__)
# Background pushes, kept referenced until they finish (an unreferenced task can
# be collected mid-flight).
_pending: set[asyncio.Task[None]] = set()

# No 0/O, 1/I/L: a code read aloud or copied by hand must not be misread.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 6


def new_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def normalise_code(raw: str) -> str:
    """What the user typed or dictated, as stored: "k7 4m2" → "K74M2"."""
    return "".join(ch for ch in raw.upper() if ch.isalnum())


async def list_owner(db: AsyncSession, user_id: uuid.UUID) -> uuid.UUID:
    """Whose list this user works on: the list they joined, or their own."""
    owner = (
        await db.execute(select(ListMember.owner_id).where(ListMember.member_id == user_id))
    ).scalar_one_or_none()
    return owner or user_id


async def _members(db: AsyncSession, owner_id: uuid.UUID) -> list[uuid.UUID]:
    return list(
        (
            await db.execute(
                select(ListMember.member_id)
                .where(ListMember.owner_id == owner_id)
                .order_by(ListMember.created_at)
            )
        ).scalars()
    )


async def everyone(db: AsyncSession, owner_id: uuid.UUID) -> list[uuid.UUID]:
    """The owner first, then the members in the order they joined."""
    return [owner_id, *await _members(db, owner_id)]


async def names(db: AsyncSession, ids: set[uuid.UUID]) -> dict[uuid.UUID, User]:
    if not ids:
        return {}
    users = (await db.execute(select(User).where(User.id.in_(ids)))).scalars()
    return {u.id: u for u in users}


async def share_state(db: AsyncSession, user_id: uuid.UUID) -> dict[str, object]:
    owner = await list_owner(db, user_id)
    ids = await everyone(db, owner)
    people = await names(db, set(ids))
    code = None
    if owner == user_id:
        code = (
            await db.execute(select(ListInvite.code).where(ListInvite.owner_id == owner))
        ).scalar_one_or_none()
    return {
        "is_owner": owner == user_id,
        "owner_name": people[owner].username if owner in people else None,
        "code": code,
        "members": [
            {
                "id": uid,
                "name": people[uid].username if uid in people else "?",
                "initials": people[uid].initials if uid in people else "?",
                "role": "owner" if uid == owner else "member",
                "you": uid == user_id,
            }
            for uid in ids
        ],
    }


async def create_code(db: AsyncSession, user_id: uuid.UUID) -> str:
    """A fresh invite code for the user's own list (the old one stops working)."""
    if await list_owner(db, user_id) != user_id:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Vous utilisez déjà la liste de quelqu'un d'autre. Quittez-la pour partager la vôtre.",
        )
    for _ in range(10):
        code = new_code()
        taken = (
            await db.execute(select(ListInvite.owner_id).where(ListInvite.code == code))
        ).scalar_one_or_none()
        if taken is None:
            break
    invite = await db.get(ListInvite, user_id)
    if invite is None:
        db.add(ListInvite(owner_id=user_id, code=code))
    else:
        invite.code = code
    await db.flush()
    return code


async def preview(db: AsyncSession, raw_code: str) -> str:
    """Whose list a code opens, for "Aymen vous invite" before joining."""
    owner = (
        await db.execute(
            select(ListInvite.owner_id).where(ListInvite.code == normalise_code(raw_code))
        )
    ).scalar_one_or_none()
    person = (await names(db, {owner})).get(owner) if owner else None
    if person is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ce code ne correspond à aucune liste.")
    return person.username


async def join(db: AsyncSession, user_id: uuid.UUID, raw_code: str) -> uuid.UUID:
    code = normalise_code(raw_code)
    owner = (
        await db.execute(select(ListInvite.owner_id).where(ListInvite.code == code))
    ).scalar_one_or_none()
    if owner is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ce code ne correspond à aucune liste.")
    if owner == user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "C'est le code de votre propre liste.")
    if await _members(db, user_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Votre liste est partagée avec d'autres personnes. "
            "Arrêtez ce partage avant d'en rejoindre une autre.",
        )
    current = await db.get(ListMember, user_id)
    if current is None:
        db.add(ListMember(member_id=user_id, owner_id=owner))
    else:
        current.owner_id = owner
    await db.flush()
    return owner


async def leave(db: AsyncSession, user_id: uuid.UUID) -> None:
    """A member leaves; an owner stops sharing (every member goes back to their list)."""
    await db.execute(delete(ListMember).where(ListMember.member_id == user_id))
    await db.execute(delete(ListMember).where(ListMember.owner_id == user_id))
    await db.execute(delete(ListInvite).where(ListInvite.owner_id == user_id))


async def remove_member(db: AsyncSession, owner_id: uuid.UUID, member_id: uuid.UUID) -> None:
    await db.execute(
        delete(ListMember).where(
            ListMember.owner_id == owner_id, ListMember.member_id == member_id
        )
    )


async def forget_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    """An erased account leaves every list it was part of, and its own shops and
    budget are erased (what someone spends is personal)."""
    await leave(db, user_id)
    await db.execute(delete(ShoppingTrip).where(ShoppingTrip.owner_id == user_id))
    await db.execute(delete(ShoppingBudget).where(ShoppingBudget.owner_id == user_id))


def added_text(actor: str, labels: list[str]) -> tuple[str, str]:
    """The push the others receive: one line, however many items arrived."""
    if len(labels) == 1:
        return "Liste de courses", f"{actor} a ajouté {labels[0]}"
    return "Liste de courses", f"{actor} a ajouté {len(labels)} produits à la liste"


async def tell_others(
    db: AsyncSession, owner_id: uuid.UUID, actor_id: uuid.UUID, labels: list[str]
) -> None:
    """Notify everyone on the list but the person who added. Sent in the background:
    a slow push service must not make adding a product slow."""
    if not labels:
        return
    others = [uid for uid in await everyone(db, owner_id) if uid != actor_id]
    if not others:
        return
    actor = (await names(db, {actor_id})).get(actor_id)
    title, body = added_text(actor.username if actor else "Quelqu'un", labels)
    tokens = [t for uid in others for t in await device_service.tokens_for_user(db, uid)]

    async def send() -> None:
        for token in tokens:
            try:
                await push.send_push(token, title, body, {"type": "list_added", "url": "/list"})
            except Exception:  # noqa: BLE001 — a push failure must never surface to the user
                log.warning("list push failed", exc_info=True)

    if tokens:
        task = asyncio.get_running_loop().create_task(send())
        _pending.add(task)
        task.add_done_callback(_pending.discard)
