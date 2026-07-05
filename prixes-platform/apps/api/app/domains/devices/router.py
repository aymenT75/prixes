"""Device-token HTTP API — register/unregister this device for push notifications."""
from __future__ import annotations

from fastapi import APIRouter, status

from app.core.deps import CurrentUser, DbSession
from app.domains.devices import service
from app.domains.devices.schemas import DeviceIn, DeviceOut

router = APIRouter(prefix="/devices", tags=["devices"])


@router.post("", response_model=DeviceOut, status_code=201)
async def register(data: DeviceIn, db: DbSession, user: CurrentUser) -> DeviceOut:
    await service.register_device(db, user.id, data)
    return DeviceOut(ok=True)


@router.delete("/{token}", status_code=status.HTTP_204_NO_CONTENT)
async def unregister(token: str, db: DbSession, user: CurrentUser) -> None:
    await service.unregister_device(db, user.id, token)
