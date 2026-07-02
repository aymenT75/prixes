"""Shared async HTTP client for upstream open-data APIs (OFF, OpenPrices, fuel)."""
from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx

_USER_AGENT = "Prixes/1.0 (+https://prixes.app; contact@prixes.app)"

_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    """Module-level pooled client (created lazily, reused across requests)."""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=5.0),
            headers={"User-Agent": _USER_AGENT},
            follow_redirects=True,
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
        )
    return _client


@asynccontextmanager
async def http_client() -> AsyncIterator[httpx.AsyncClient]:
    yield get_http_client()


async def close_http_client() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
        _client = None
