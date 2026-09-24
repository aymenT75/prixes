"""`PremiumUser`: a signed-in account with a live subscription, else 402."""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.core.deps import CurrentUser
from app.domains.billing.service import is_premium, premium_required
from app.domains.users.models import User


async def get_premium_user(user: CurrentUser) -> User:
    if not is_premium(user):
        raise premium_required()
    return user


PremiumUser = Annotated[User, Depends(get_premium_user)]
