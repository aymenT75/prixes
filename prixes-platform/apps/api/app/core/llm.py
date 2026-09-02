"""One JSON-mode LLM call, provider-agnostic.

Every V3 feature that asks a model for structured data comes through here: the
shopping list from a sentence and the week of meals. The
caller hands over a JSON Schema and gets back a dict that satisfies it, or None.

Provider choice mirrors ``products/recognize.py`` — OpenAI when its key is set,
Anthropic otherwise, neither means the feature is simply unavailable. Both are
called over plain HTTPS: no SDK, no new dependency, and the schema is enforced by
the provider (OpenAI structured outputs / Anthropic tool use) rather than by
parsing hope out of free text.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx
import orjson

from app.core.config import settings
from app.core.http import get_http_client

logger = logging.getLogger(__name__)

_OPENAI_URL = "https://api.openai.com/v1/chat/completions"
_ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
_ANTHROPIC_VERSION = "2023-06-01"

# Keywords to drop before sending a schema upstream.
#
# The first group is cosmetic and strict mode rejects it outright. The second is
# validation: provider support for length/range/count keywords has come and gone
# across model versions, and a schema the provider refuses fails the whole
# request. So we send the *shape* — types and enums, which are what actually
# steer the model — and keep the limits where they belong, in the prompt and in
# our own validation of the answer.
_STRIP_KEYS = (
    "default", "title", "examples", "format",
    "maxLength", "minLength", "pattern",
    "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
    "minItems", "maxItems", "uniqueItems",
)


def llm_enabled() -> bool:
    return bool(settings.openai_api_key or settings.anthropic_api_key)


def strictify(schema: Any) -> Any:
    """Turn a Pydantic JSON Schema into one OpenAI strict mode will accept.

    Strict mode demands that every object forbids extra keys and lists *all* of
    its properties as required. Pydantic emits neither, and also carries `title`
    and `default` annotations that strict mode refuses. So walk the tree once and
    normalise it. Anthropic is more forgiving but accepts the same shape, which
    is why both providers share this function.
    """
    if isinstance(schema, list):
        return [strictify(v) for v in schema]
    if not isinstance(schema, dict):
        return schema

    out = {k: v for k, v in schema.items() if k not in _STRIP_KEYS}
    for key in ("$defs", "properties"):
        if isinstance(out.get(key), dict):
            out[key] = {k: strictify(v) for k, v in out[key].items()}
    for key in ("items", "additionalItems"):
        if isinstance(out.get(key), dict):
            out[key] = strictify(out[key])
    for key in ("anyOf", "allOf", "oneOf"):
        if isinstance(out.get(key), list):
            out[key] = strictify(out[key])

    if out.get("type") == "object":
        out["additionalProperties"] = False
        props = out.get("properties")
        if isinstance(props, dict):
            out["required"] = list(props.keys())
    return out


async def _post(
    url: str, payload: dict[str, Any], headers: dict[str, str], timeout_s: float
) -> Any:
    resp = await get_http_client().post(url, json=payload, headers=headers, timeout=timeout_s)
    if resp.status_code != 200:
        logger.warning(f"LLM call to {url} returned {resp.status_code}: {resp.text[:300]}")
        return None
    return resp.json()


async def _call_openai(
    system: str, user: str, schema: dict[str, Any], name: str, max_tokens: int, timeout_s: float
) -> dict[str, Any] | None:
    payload: dict[str, Any] = {
        "model": settings.smartcart_model,
        "max_tokens": max_tokens,
        "temperature": 0.3,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": name, "strict": True, "schema": schema},
        },
    }
    data = await _post(
        _OPENAI_URL, payload, {"Authorization": f"Bearer {settings.openai_api_key}"}, timeout_s
    )
    if data is None:
        return None
    choice = data["choices"][0]
    # A refusal is a first-class field in structured outputs; it is not an error.
    if choice["message"].get("refusal"):
        logger.info("LLM refused the request")
        return None
    content = choice["message"].get("content")
    return orjson.loads(content) if content else None


async def _call_anthropic(
    system: str, user: str, schema: dict[str, Any], name: str, max_tokens: int, timeout_s: float
) -> dict[str, Any] | None:
    payload: dict[str, Any] = {
        "model": settings.smartcart_anthropic_model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
        # Forcing the tool is Anthropic's equivalent of a strict response format:
        # the model can only answer by filling in this schema.
        "tools": [
            {"name": name, "description": f"Réponse structurée : {name}", "input_schema": schema}
        ],
        "tool_choice": {"type": "tool", "name": name},
    }
    headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": _ANTHROPIC_VERSION,
    }
    data = await _post(_ANTHROPIC_URL, payload, headers, timeout_s)
    if data is None:
        return None
    for block in data.get("content", []):
        if block.get("type") == "tool_use":
            result: dict[str, Any] = block["input"]
            return result
    return None


async def generate_json(
    *,
    system: str,
    user: str,
    schema: dict[str, Any],
    schema_name: str,
    max_tokens: int = 2000,
    timeout_s: float | None = None,
) -> dict[str, Any] | None:
    """Ask the model for a document matching ``schema``. None on any failure.

    Returning None rather than raising is deliberate: every caller has a sane
    degraded path (manual entry), and an upstream outage should never surface as
    a 500. One retry covers the transient case; beyond that we give up quickly,
    because a user is watching a spinner.
    """
    if not llm_enabled():
        return None
    timeout = timeout_s if timeout_s is not None else settings.smartcart_timeout_s
    strict = strictify(schema)
    use_openai = bool(settings.openai_api_key)

    for attempt in (1, 2):
        try:
            if use_openai:
                return await _call_openai(system, user, strict, schema_name, max_tokens, timeout)
            return await _call_anthropic(system, user, strict, schema_name, max_tokens, timeout)
        except (httpx.TimeoutException, TimeoutError):
            logger.warning(f"LLM timeout after {timeout}s (attempt {attempt})")
        except httpx.HTTPError as exc:
            logger.warning(f"LLM transport error (attempt {attempt}): {exc}")
        except (KeyError, IndexError, orjson.JSONDecodeError) as exc:
            # A malformed body will not fix itself on retry.
            logger.error(f"LLM returned an unreadable body: {exc}")
            return None
    return None
