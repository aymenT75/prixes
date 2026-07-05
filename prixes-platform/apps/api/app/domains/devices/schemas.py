"""Device registration schemas."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class DeviceIn(BaseModel):
    token: str = Field(min_length=8, max_length=255)
    platform: Literal["ios", "android", "web"] = "web"


class DeviceOut(BaseModel):
    ok: bool = True
