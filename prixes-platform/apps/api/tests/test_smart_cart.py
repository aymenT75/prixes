"""Smart Assistant — the logic that decides what lands in a user's basket.

These cover the parts that must be right without a model or a database: the
schema we hand upstream, the clamping of whatever comes back, the name matching,
and the pack arithmetic that turns "1,5 kg" into a number the price is
multiplied by.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest

from app.core.llm import strictify
from app.domains.products.models import Product
from app.domains.products.units import packs_needed, to_base_amount
from app.domains.smartcart.resolve import _similarity, allergen_conflict, sanitise
from app.domains.smartcart.schemas import AiDraft, AiLine
from app.domains.smartcart.service import _cache_key


def _walk_schemas(node: Any, path: str = "root") -> list[tuple[str, dict[str, Any]]]:
    """Every JSON-Schema node in the tree, skipping property *names*.

    The distinction matters: `properties.title` is a field called "title", not
    the `title` annotation keyword, and confusing the two produces a false alarm.
    """
    found: list[tuple[str, dict[str, Any]]] = []
    if isinstance(node, dict):
        if "type" in node or "enum" in node or "$ref" in node:
            found.append((path, node))
        for key, value in node.items():
            if key in ("properties", "$defs"):
                for name, sub in value.items():
                    found += _walk_schemas(sub, f"{path}.{key}[{name}]")
            else:
                found += _walk_schemas(value, f"{path}.{key}")
    elif isinstance(node, list):
        for i, value in enumerate(node):
            found += _walk_schemas(value, f"{path}[{i}]")
    return found


# ── The contract we send upstream ────────────────────────────────────────────
def test_schema_satisfies_openai_strict_mode() -> None:
    schema = strictify(AiDraft.model_json_schema())
    for path, node in _walk_schemas(schema):
        if node.get("type") != "object":
            continue
        assert node.get("additionalProperties") is False, f"{path} allows extra keys"
        assert set(node.get("properties", {})) == set(node.get("required", [])), (
            f"{path} does not require all of its properties"
        )


@pytest.mark.parametrize(
    "keyword",
    ["maxLength", "minLength", "maximum", "minimum", "exclusiveMinimum", "maxItems", "default"],
)
def test_schema_carries_no_validation_keywords(keyword: str) -> None:
    """Provider support for these has moved between model versions; a schema the
    provider rejects fails the whole request, so we send shape only."""
    schema = strictify(AiDraft.model_json_schema())
    for path, node in _walk_schemas(schema):
        assert keyword not in node, f"{path} still carries {keyword}"


def test_schema_keeps_the_enums() -> None:
    """Units and aisles are the constraints that actually steer the model."""
    schema = strictify(AiDraft.model_json_schema())
    enums = [node["enum"] for _, node in _walk_schemas(schema) if "enum" in node]
    assert any("kg" in e for e in enums)
    assert any("boucherie" in e for e in enums)


def test_title_field_survives_stripping() -> None:
    """`title` is both a schema keyword and one of our fields — only the keyword
    should be removed, or off-topic detection loses its signal."""
    schema = strictify(AiDraft.model_json_schema())
    assert "title" in schema["properties"]
    assert "title" not in {k for k in schema if k != "properties"}


# ── Clamping whatever the model returned ─────────────────────────────────────
def _line(**kw: Any) -> AiLine:
    base = {
        "product_name": "Tomates",
        "amount": 1.0,
        "unit": "kg",
        "category": "fruits-légumes",
        "optional": False,
    }
    return AiLine.model_validate(base | kw)


@pytest.mark.parametrize("amount", [0.0, -3.0, float("inf"), float("nan")])
def test_unusable_amounts_are_dropped(amount: float) -> None:
    assert sanitise([_line(amount=amount)]) == []


def test_blank_names_are_dropped() -> None:
    assert sanitise([_line(product_name="   ")]) == []


def test_absurd_amount_is_capped_not_dropped() -> None:
    (line,) = sanitise([_line(amount=99999.0)])
    assert line.amount == 9999.0


def test_long_name_is_trimmed() -> None:
    (line,) = sanitise([_line(product_name="a" * 400)])
    assert len(line.product_name) == 120


# ── Matching a model's wording to a catalog label ────────────────────────────
@pytest.mark.parametrize(
    ("query", "name"),
    [
        ("fromage à raclette", "Fromage à raclette"),
        ("creme fraiche", "Crème fraîche épaisse"),
        ("pommes de terre", "Pommes de terre Charlotte 2,5 kg"),
        ("raclette fromage", "Fromage à raclette Richesmonts"),
    ],
)
def test_matches_survive_accents_case_and_extra_words(query: str, name: str) -> None:
    assert _similarity(query, name) >= 0.70


@pytest.mark.parametrize(
    ("query", "name"),
    [("cornichons", "Yaourt nature"), ("baguette", "Lessive liquide")],
)
def test_unrelated_names_score_low(query: str, name: str) -> None:
    assert _similarity(query, name) < 0.50


# ── Allergens are our decision, not the model's ──────────────────────────────
def _product(allergens: str | None) -> Product:
    return Product(barcode="123", name="Test", allergens=allergens)


def test_allergen_conflict_is_reported_ignoring_accents() -> None:
    product = _product("lait, fruits à coque")
    assert allergen_conflict(product, {"fruits a coque"}) == "fruits à coque"


def test_no_conflict_when_profile_is_empty() -> None:
    assert allergen_conflict(_product("lait"), set()) is None


def test_no_conflict_when_product_declares_nothing() -> None:
    assert allergen_conflict(_product(None), {"lait"}) is None


# ── Recipe quantity → packs to buy ───────────────────────────────────────────
@pytest.mark.parametrize(
    ("amount", "unit", "pack", "expected"),
    [
        (Decimal("1.5"), "kg", "400 g", 4),      # the raclette case
        (Decimal("1.5"), "kg", "1,5 kg", 1),
        (Decimal("2"), "L", "1L", 2),
        (Decimal("0.2"), "kg", "500 g", 1),      # never round down to zero
        (Decimal("6"), "pièce", None, 6),        # countable units pass through
        (Decimal("300"), "g", "6 x 33 cl", 1),   # mass vs volume: refuse to guess
        (Decimal("500"), "g", None, 1),          # unknown pack size
    ],
)
def test_packs_needed(amount: Decimal, unit: str, pack: str | None, expected: int) -> None:
    assert packs_needed(amount, unit, pack) == expected


def test_countable_units_have_no_base_conversion() -> None:
    assert to_base_amount(Decimal(3), "pièce") is None
    assert to_base_amount(Decimal(500), "g") == (Decimal("0.5"), "kg")


# ── Cache identity ───────────────────────────────────────────────────────────
def test_cache_key_ignores_case_and_spacing() -> None:
    assert _cache_key("Raclette  pour 6 ", 6) == _cache_key("raclette pour 6", 6)


def test_cache_key_separates_servings() -> None:
    assert _cache_key("raclette", 4) != _cache_key("raclette", 6)


# ── A match whose format makes no sense is not a match ───────────────────────
def test_an_implausible_pack_count_rejects_the_match() -> None:
    """Found in production: 1,8 kg of potatoes matched a product sold by the
    gram, so the basket asked for 99 packs and quoted 98 € for a raclette. The
    line must survive without a price rather than carry a confident wrong one."""
    from app.domains.smartcart.resolve import _MAX_PACKS

    # 1.8 kg against a 20 g pack.
    assert packs_needed(Decimal("1.8"), "kg", "20 g") > _MAX_PACKS
    # The realistic cases stay well under the bar.
    assert packs_needed(Decimal("1.8"), "kg", "2,5 kg") <= _MAX_PACKS
    assert packs_needed(Decimal("1.2"), "kg", "400 g") <= _MAX_PACKS
