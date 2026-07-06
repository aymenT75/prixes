"""AI product recognition from a photo — vision fallback for the deal flow.

Barcode detection (client-side) is tried first; this is only called when no
barcode is found. Uses OpenAI (GPT-4o vision) when an OpenAI key is configured,
otherwise Anthropic (Claude vision) — both via plain HTTPS (no SDK). Returns
(None, None) when neither key is set, so the UI degrades to manual entry.
"""
from __future__ import annotations

from app.core.config import settings
from app.core.http import get_http_client

_OPENAI_URL = "https://api.openai.com/v1/chat/completions"
_ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
_PROMPT = (
    "Tu identifies un produit de supermarché sur une photo. "
    "Réponds UNIQUEMENT au format 'Nom du produit | Marque', sans phrase ni explication. "
    "Si tu ne reconnais pas de produit, réponds exactement 'INCONNU'."
)


def _parse(text: str) -> tuple[str | None, str | None]:
    text = (text or "").strip()
    if not text or text.upper().startswith("INCONNU"):
        return None, None
    name, _, brand = text.partition("|")
    return (name.strip() or None), (brand.strip() or None)


async def _recognize_openai(image_b64: str, media_type: str) -> tuple[str | None, str | None]:
    payload = {
        "model": settings.openai_recognition_model,
        "max_tokens": 60,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{media_type};base64,{image_b64}"},
                    },
                ],
            }
        ],
    }
    headers = {"Authorization": f"Bearer {settings.openai_api_key}"}
    try:
        resp = await get_http_client().post(
            _OPENAI_URL, json=payload, headers=headers, timeout=20.0
        )
        if resp.status_code != 200:
            return None, None
        text = resp.json()["choices"][0]["message"]["content"]
    except Exception:  # noqa: BLE001
        return None, None
    return _parse(text)


async def _recognize_anthropic(image_b64: str, media_type: str) -> tuple[str | None, str | None]:
    payload = {
        "model": settings.recognition_model,
        "max_tokens": 60,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": media_type, "data": image_b64},
                    },
                    {"type": "text", "text": _PROMPT},
                ],
            }
        ],
    }
    headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    try:
        resp = await get_http_client().post(
            _ANTHROPIC_URL, json=payload, headers=headers, timeout=20.0
        )
        if resp.status_code != 200:
            return None, None
        blocks = resp.json().get("content", [])
        text = next((b.get("text", "") for b in blocks if b.get("type") == "text"), "")
    except Exception:  # noqa: BLE001
        return None, None
    return _parse(text)


async def recognize_product(image_b64: str, media_type: str) -> tuple[str | None, str | None]:
    """Return (product_name, brand) or (None, None). Raises nothing fatal.
    Prefers OpenAI GPT-4o when configured, else Anthropic Claude."""
    if settings.openai_api_key:
        return await _recognize_openai(image_b64, media_type)
    if settings.anthropic_api_key:
        return await _recognize_anthropic(image_b64, media_type)
    return None, None
