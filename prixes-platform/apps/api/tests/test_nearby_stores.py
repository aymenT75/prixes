"""Nearby stores: a slow OpenStreetMap must not turn into "no store near you"."""
from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.domains.stores import service

ELEMENTS = [
    {"id": 1, "lat": 48.857, "lon": 2.352, "tags": {"name": "Carrefour City", "brand": "Carrefour"}}
]


class _Resp:
    def __init__(self, ok: bool, elements: list[dict[str, Any]] | None = None) -> None:
        self.ok = ok
        self.elements = elements if elements is not None else ELEMENTS

    def raise_for_status(self) -> None:
        if not self.ok:
            raise RuntimeError("504")

    def json(self) -> dict[str, object]:
        return {"elements": self.elements}


class _Redis:
    def __init__(self) -> None:
        self.data: dict[str, bytes] = {}

    async def get(self, key: str) -> bytes | None:
        return self.data.get(key)

    async def set(self, key: str, value: bytes, ex: int | None = None) -> None:
        self.data[key] = value


def _setup(monkeypatch: pytest.MonkeyPatch, responses: list[_Resp], calls: list[str]) -> _Redis:
    class Client:
        async def post(self, url: str, **kwargs: object) -> _Resp:
            calls.append(url)
            return responses.pop(0)

    redis = _Redis()
    monkeypatch.setattr(service, "get_http_client", lambda: Client())
    monkeypatch.setattr(service, "redis_client", redis)
    return redis


def test_a_failing_instance_falls_through_to_a_mirror(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    _setup(monkeypatch, [_Resp(False), _Resp(True)], calls)
    stores, source = asyncio.run(service.nearby(48.8566, 2.3522))
    assert [s.name for s in stores] == ["Carrefour City"]
    assert source == "live"
    assert calls == [url for url, _ in service.OVERPASS_URLS[:2]]


def test_when_every_instance_fails_the_last_list_is_served(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    redis = _setup(monkeypatch, [_Resp(True)], calls)
    asyncio.run(service.nearby(48.8566, 2.3522))
    # The 6-hour copy expires; only the week-long fallback is left.
    for key in [k for k in redis.data if not k.endswith(":stale")]:
        del redis.data[key]
    fails = [_Resp(False) for _ in service.OVERPASS_URLS]
    _setup(monkeypatch, fails, calls).data.update(redis.data)
    stores, source = asyncio.run(service.nearby(48.8566, 2.3522))
    assert [s.name for s in stores] == ["Carrefour City"]
    assert source == "stale"


def test_nothing_to_serve_says_unavailable_not_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    _setup(monkeypatch, [_Resp(False) for _ in service.OVERPASS_URLS], calls)
    stores, source = asyncio.run(service.nearby(48.8566, 2.3522))
    assert stores == []
    assert source == "unavailable"


def test_a_real_empty_answer_is_not_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    _setup(monkeypatch, [_Resp(True, [])], calls)
    stores, source = asyncio.run(service.nearby(0.0, 0.0))
    assert stores == []
    assert source == "live"
