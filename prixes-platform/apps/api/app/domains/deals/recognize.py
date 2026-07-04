"""AI product recognition from a photo — vision fallback for the deal flow.

Barcode detection (client-side) is tried first; this is only called when no
barcode is found. Uses Anthropic's vision model via a plain HTTPS call (no SDK
dependency). Returns (available=False) when no API key is configured, so the UI
degrades gracefully to manual entry.
"""
from __future__ import annotations

from app.core.config import settings
from app.core.http import get_http_client

_ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
_PROMPT = (
    "Tu identifies un produit de supermarché sur une photo. "
    "Réponds UNIQUEMENT au format 'Nom du produit | Marque', sans phrase ni explication. "
    "Si tu ne reconnais pas de produit, réponds exactement 'INCONNU'."
)


async def recognize_product(image_b64: str, media_type: str) -> tuple[str | None, str | None]:
    """Return (product_name, brand) or (None, None). Raises nothing fatal."""
    if not settings.anthropic_api_key:
        return None, None

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
        text = next((b.get("text", "") for b in blocks if b.get("type") == "text"), "").strip()
    except Exception:  # noqa: BLE001
        return None, None

    if not text or text.upper().startswith("INCONNU"):
        return None, None
    name, _, brand = text.partition("|")
    name = name.strip() or None
    brand = brand.strip() or None
    return name, brand
