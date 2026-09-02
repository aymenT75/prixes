"""Fetch a user-supplied recipe URL, safely.

The URL comes from whoever is using the app, which makes this endpoint a
server-side request forgery primitive unless it is fenced in. Four fences:

- HTTPS only, so an ``http://`` hop can't be silently downgraded.
- Every hostname is resolved and every resulting address checked before we
  connect. Private ranges, loopback, link-local (169.254.169.254 is the cloud
  metadata endpoint) and anything else non-public is refused.
- Redirects are followed by hand, three at most, re-checking each hop — a target
  that passes the first check can still redirect to localhost.
- The body is streamed and cut off at 2 MB, so a huge response can't exhaust
  the droplet's memory.
"""
from __future__ import annotations

import asyncio
import ipaddress
import logging
import socket
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException, status

from app.core.http import get_http_client

logger = logging.getLogger(__name__)

MAX_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 3
TIMEOUT_S = 10.0


def _refuse(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, detail)


def _address_is_public(host: str) -> bool:
    """True only when every address the hostname resolves to is publicly routable.

    Every address, not the first: a hostname that resolves to both a public and a
    private address would otherwise be a way through.
    """
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        try:
            address = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False
        if (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_multicast
            or address.is_reserved
            or address.is_unspecified
        ):
            return False
    return bool(infos)


async def _check(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise _refuse("Seuls les liens https sont acceptés.")
    if not parsed.hostname:
        raise _refuse("Ce lien n'est pas valide.")
    # getaddrinfo blocks; keep it off the event loop.
    if not await asyncio.to_thread(_address_is_public, parsed.hostname):
        raise _refuse("Ce lien ne pointe pas vers un site public.")


async def _read_capped(response: httpx.Response) -> str:
    chunks: list[bytes] = []
    size = 0
    async for chunk in response.aiter_bytes():
        size += len(chunk)
        if size > MAX_BYTES:
            raise _refuse("Cette page est trop lourde pour être analysée.")
        chunks.append(chunk)
    body = b"".join(chunks)
    encoding = response.charset_encoding or "utf-8"
    return body.decode(encoding, errors="replace")


async def fetch_html(url: str) -> tuple[str, str]:
    """Return (final_url, html). Raises HTTPException with a user-facing message."""
    client = get_http_client()
    current = url

    for _ in range(MAX_REDIRECTS + 1):
        await _check(current)
        try:
            request = client.build_request(
                "GET",
                current,
                headers={"Accept": "text/html,application/xhtml+xml"},
                timeout=TIMEOUT_S,
            )
            # Redirects are handled here, not by httpx, so each hop is re-checked.
            response = await client.send(request, stream=True, follow_redirects=False)
        except httpx.TimeoutException as exc:
            raise _refuse("Le site n'a pas répondu à temps.") from exc
        except httpx.HTTPError as exc:
            logger.info(f"Recipe fetch failed for {current}: {exc}")
            raise _refuse("Impossible d'ouvrir ce lien.") from exc

        try:
            if response.is_redirect:
                location = response.headers.get("location")
                if not location:
                    raise _refuse("Impossible d'ouvrir ce lien.")
                current = str(response.next_request.url) if response.next_request else location
                continue
            if response.status_code != 200:
                raise _refuse(f"Le site a répondu {response.status_code}.")
            content_type = response.headers.get("content-type", "")
            if "html" not in content_type and "xml" not in content_type:
                raise _refuse("Ce lien n'est pas une page de recette.")
            return current, await _read_capped(response)
        finally:
            await response.aclose()

    raise _refuse("Ce lien redirige trop de fois.")
