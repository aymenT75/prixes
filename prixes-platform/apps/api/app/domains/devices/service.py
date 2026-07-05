"""Device-token service — register/unregister push targets and look them up."""
from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.devices.models import Device
from app.domains.devices.schemas import DeviceIn


async def register_device(db: AsyncSession, user_id: uuid.UUID, data: DeviceIn) -> Device:
    """Upsert by token: re-registering an existing token re-points it to this user
    (e.g. a shared device, or a user who logged out and back in)."""
    device = (
        await db.execute(select(Device).where(Device.token == data.token))
    ).scalar_one_or_none()
    if device is not None:
        device.user_id = user_id
        device.platform = data.platform
        await db.flush()
        return device
    device = Device(user_id=user_id, token=data.token, platform=data.platform)
    db.add(device)
    await db.flush()
    return device


async def unregister_device(db: AsyncSession, user_id: uuid.UUID, token: str) -> None:
    await db.execute(
        delete(Device).where(Device.token == token, Device.user_id == user_id)
    )


async def delete_by_token(db: AsyncSession, token: str) -> None:
    """Remove a token that FCM reported as invalid/unregistered."""
    await db.execute(delete(Device).where(Device.token == token))


async def tokens_for_user(db: AsyncSession, user_id: uuid.UUID) -> list[str]:
    return list(
        (
            await db.execute(select(Device.token).where(Device.user_id == user_id))
        ).scalars()
    )
