"""Admin/moderator-only endpoints must reject regular users — security property
called out in the SIT audit. The role check happens before any DB query, so
these run against a fake in-memory user via dependency override; no database
needed."""
from __future__ import annotations

import uuid
from collections.abc import Iterator

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.deps import get_current_user
from app.domains.users.models import User
from app.main import app


def _fake_user(role: str) -> User:
    return User(
        id=uuid.uuid4(),
        email=f"{role}@test.invalid",
        username=role,
        initials=role[:2].upper(),
        role=role,
    )


@pytest.fixture(autouse=True)
def _clear_overrides() -> Iterator[None]:
    yield
    app.dependency_overrides.clear()


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", ["/api/v1/feedback", "/api/v1/moderation/reports"])
async def test_regular_user_forbidden(endpoint: str) -> None:
    app.dependency_overrides[get_current_user] = lambda: _fake_user("user")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(endpoint)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_rejected() -> None:
    """No token at all — must not fall through to the admin data."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/feedback")
    assert resp.status_code == 401
