"""Recipe import — reading a page, and refusing the wrong ones.

The SSRF checks matter more than the parsing here: the URL is supplied by
whoever is using the app, so this endpoint is a way to make the droplet issue
requests on their behalf unless every hop is verified.
"""
from __future__ import annotations

import json

import pytest

from app.domains.recipes.fetch import _address_is_public
from app.domains.recipes.jsonld import (
    find_recipe,
    ingredients_from,
    parse_ingredient,
    servings_from,
    title_from,
)


def _page(payload: object) -> str:
    return (
        "<html><head><script type=\"application/ld+json\">"
        + json.dumps(payload, ensure_ascii=False)
        + "</script></head><body>Recette</body></html>"
    )


RECIPE = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": "Gratin dauphinois",
    "recipeYield": "6 personnes",
    "recipeIngredient": [
        "1,5 kg de pommes de terre",
        "50 cl de crème fraîche",
        "2 gousses d'ail",
        "sel",
        "poivre",
    ],
    "recipeInstructions": ["Éplucher", "Enfourner"],
}


# ── Finding the recipe in the page ───────────────────────────────────────────
def test_finds_a_plain_recipe_block() -> None:
    node = find_recipe(_page(RECIPE))
    assert node is not None
    assert title_from(node) == "Gratin dauphinois"


def test_finds_a_recipe_inside_a_graph() -> None:
    """Most real sites wrap their nodes in @graph rather than publishing one."""
    page = _page({"@context": "https://schema.org", "@graph": [{"@type": "WebPage"}, RECIPE]})
    node = find_recipe(page)
    assert node is not None and title_from(node) == "Gratin dauphinois"


def test_finds_a_recipe_in_a_top_level_list() -> None:
    node = find_recipe(_page([{"@type": "Organization"}, RECIPE]))
    assert node is not None


def test_handles_type_given_as_a_list() -> None:
    node = find_recipe(_page({**RECIPE, "@type": ["Recipe", "NewsArticle"]}))
    assert node is not None


def test_page_without_structured_data_returns_none() -> None:
    assert find_recipe("<html><body>Just a blog post</body></html>") is None


def test_malformed_json_is_skipped_not_raised() -> None:
    html = '<script type="application/ld+json">{not json}</script>' + _page(RECIPE)
    assert find_recipe(html) is not None


# ── Ingredient lines ─────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    ("text", "name", "amount", "unit"),
    [
        ("1,5 kg de pommes de terre", "pommes de terre", 1.5, "kg"),
        ("50 cl de crème fraîche", "crème fraîche", 50.0, "cl"),
        ("500 g de farine", "farine", 500.0, "g"),
        ("2 gousses d'ail", "ail", 2.0, "pièce"),
        ("3 oeufs", "oeufs", 3.0, "pièce"),
        ("1 boîte de tomates pelées", "tomates pelées", 1.0, "boîte"),
    ],
)
def test_parses_common_french_ingredient_lines(
    text: str, name: str, amount: float, unit: str
) -> None:
    line = parse_ingredient(text)
    assert line is not None
    assert line.product_name == name
    assert line.amount == amount
    assert line.unit == unit


def test_seasoning_quantities_become_a_countable_unit() -> None:
    """A tablespoon is not a shopping quantity — you buy the jar."""
    line = parse_ingredient("2 cuillères à soupe d'huile d'olive")
    assert line is not None and line.unit == "pièce"


def test_ingredient_without_a_quantity_still_counts_as_one() -> None:
    line = parse_ingredient("persil frais")
    assert line is not None and line.amount == 1.0


@pytest.mark.parametrize("staple", ["sel", "poivre", "eau"])
def test_pantry_staples_are_not_put_on_the_list(staple: str) -> None:
    assert parse_ingredient(staple) is None


def test_html_inside_an_ingredient_is_stripped() -> None:
    line = parse_ingredient("<span>200 g</span> de beurre")
    assert line is not None and line.product_name == "beurre"


def test_ingredients_from_drops_the_staples() -> None:
    lines = ingredients_from(RECIPE)
    names = [line.product_name for line in lines]
    assert names == ["pommes de terre", "crème fraîche", "ail"]


# ── Servings ─────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    ("value", "expected"),
    [("6 personnes", 6), (4, 4), ("4", 4), (["8", "8 parts"], 8), (None, 4)],
)
def test_reads_servings_from_every_shape_sites_use(value: object, expected: int) -> None:
    assert servings_from({"recipeYield": value} if value is not None else {}) == expected


# ── SSRF fences ──────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "host",
    [
        "127.0.0.1",       # loopback
        "localhost",
        "10.0.0.5",        # private
        "192.168.1.1",
        "172.16.0.1",
        "169.254.169.254", # cloud metadata endpoint
        "0.0.0.0",         # noqa: S104 — the point of the test is that we refuse it
        "[::1]",           # loopback, v6
        "not-a-real-host.invalid",
    ],
)
def test_non_public_targets_are_refused(host: str) -> None:
    assert _address_is_public(host.strip("[]")) is False
