"""OpenFoodFacts + OpenPrices client adapters (normalise upstream into our schema)."""
from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.core.http import get_http_client

# EU-14 allergen tags (OpenFoodFacts canonical) → French labels.
ALLERGEN_FR = {
    "gluten": "gluten",
    "milk": "lait",
    "eggs": "œufs",
    "nuts": "fruits à coque",
    "tree-nuts": "fruits à coque",
    "peanuts": "arachides",
    "soybeans": "soja",
    "soy": "soja",
    "fish": "poisson",
    "crustaceans": "crustacés",
    "molluscs": "mollusques",
    "celery": "céleri",
    "mustard": "moutarde",
    "sesame-seeds": "sésame",
    "sesame": "sésame",
    "sulphur-dioxide-and-sulphites": "sulfites",
    "sulphites": "sulfites",
    "lupin": "lupin",
}


def _extract_allergens(product: dict[str, Any]) -> str | None:
    """Return a comma-separated FR allergen list from OFF tags."""
    tags = product.get("allergens_tags") or []
    labels: list[str] = []
    for t in tags:
        key = str(t).split(":")[-1].strip().lower()
        label = ALLERGEN_FR.get(key, key.replace("-", " "))
        if label and label not in labels:
            labels.append(label)
    return ", ".join(labels) or None


def _extract_diets(product: dict[str, Any]) -> str | None:
    """Return comma-separated FR diet labels the product SATISFIES.

    Uses OFF `ingredients_analysis_tags` (reliable vegan/vegetarian) plus
    `labels_tags` (gluten-free, organic, halal, kosher, lactose-free).
    """
    diets: list[str] = []

    def add(label: str) -> None:
        if label not in diets:
            diets.append(label)

    analysis = {str(t).lower() for t in (product.get("ingredients_analysis_tags") or [])}
    if "en:vegan" in analysis:
        add("végan")
        add("végétarien")
    if "en:vegetarian" in analysis:
        add("végétarien")

    label_keys = {str(t).split(":")[-1].strip().lower() for t in (product.get("labels_tags") or [])}
    if {"vegan"} & label_keys:
        add("végan")
        add("végétarien")
    if {"vegetarian"} & label_keys:
        add("végétarien")
    if {"gluten-free", "no-gluten"} & label_keys:
        add("sans gluten")
    if {"no-lactose", "lactose-free"} & label_keys:
        add("sans lactose")
    if {"organic", "eu-organic", "ab-agriculture-biologique", "fr-bio"} & label_keys:
        add("bio")
    if {"halal", "halal-food"} & label_keys:
        add("halal")
    if {"kosher", "kosher-food"} & label_keys:
        add("casher")
    return ", ".join(diets) or None


def _normalise_off(barcode: str, product: dict[str, Any]) -> dict[str, Any]:
    nova = product.get("nova_group")
    return {
        "barcode": barcode,
        "name": product.get("product_name_fr") or product.get("product_name"),
        "brand": (product.get("brands") or "").split(",")[0].strip() or None,
        "image_url": product.get("image_front_url") or product.get("image_url"),
        "quantity": product.get("quantity"),
        "nutriscore": (product.get("nutriscore_grade") or product.get("nutrition_grades") or "")[:1]
        or None,
        "ecoscore": (product.get("ecoscore_grade") or "")[:1] or None,
        "nova_group": int(nova) if isinstance(nova, (int, str)) and str(nova).isdigit() else None,
        "categories": product.get("categories"),
        "allergens": _extract_allergens(product),
        "diets": _extract_diets(product),
        "raw_off": product,
    }


async def fetch_off_product(barcode: str) -> dict[str, Any] | None:
    """Fetch a single product by barcode from OpenFoodFacts."""
    url = f"{settings.off_base_url}/api/v2/product/{barcode}.json"
    resp = await get_http_client().get(url)
    if resp.status_code != 200:
        return None
    data = resp.json()
    if data.get("status") != 1 or "product" not in data:
        return None
    return _normalise_off(barcode, data["product"])


async def search_off(query: str, page: int = 1, page_size: int = 20) -> list[dict[str, Any]]:
    """Full-text product search on OpenFoodFacts (French market)."""
    url = f"{settings.off_base_url}/cgi/search.pl"
    params = {
        "search_terms": query,
        "search_simple": 1,
        "action": "process",
        "json": 1,
        "page": page,
        "page_size": page_size,
        "fields": "code,product_name,product_name_fr,brands,image_front_url,"
        "nutriscore_grade,ecoscore_grade,nova_group,categories,quantity,allergens_tags,"
        "labels_tags,ingredients_analysis_tags",
    }
    resp = await get_http_client().get(url, params=params, timeout=8.0)
    if resp.status_code != 200:
        return []
    products = resp.json().get("products", [])
    return [_normalise_off(p.get("code", ""), p) for p in products if p.get("code")]


async def fetch_openprices(barcode: str) -> list[dict[str, Any]]:
    """Fetch community price points for a barcode from OpenPrices."""
    url = f"{settings.openprices_base_url}/v1/prices"
    params = {"product_code": barcode, "size": 25, "order_by": "-created"}
    resp = await get_http_client().get(url, params=params)
    if resp.status_code != 200:
        return []
    out: list[dict[str, Any]] = []
    for item in resp.json().get("items", []):
        out.append(
            {
                "store": (item.get("location") or {}).get("osm_name") if isinstance(
                    item.get("location"), dict
                ) else None,
                "price": item.get("price"),
                "currency": item.get("currency", "EUR"),
                "location": None,
            }
        )
    return out
