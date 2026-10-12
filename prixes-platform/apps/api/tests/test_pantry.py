"""The cupboard ("Je l'ai déjà") and menus that finish what is open."""
from __future__ import annotations

import random
from datetime import UTC, datetime

from app.domains.mealplan import catalog
from app.domains.mealplan.schemas import MealPlanIn
from app.domains.shopping.budget import week_start
from app.domains.shopping.pantry import has, plain
from app.domains.shopping.schemas import ShoppingItemIn


def line(name: str, barcode: str | None = None) -> ShoppingItemIn:
    return ShoppingItemIn(barcode=barcode, free_text=None if barcode else name, name=name)


def test_what_we_have_is_not_bought_again() -> None:
    barcodes, names = {"1234"}, {plain("Riz")}
    assert has(line("Riz basmati 1 kg"), barcodes, names)
    assert has(line("Pâtes", barcode="1234"), barcodes, names)
    assert not has(line("Lait"), barcodes, names)
    # "riz" in the cupboard does not cover "galettes de riz".
    assert not has(line("Galettes de riz"), barcodes, names)


def test_the_week_starts_on_monday_in_france() -> None:
    # Wednesday 7 Oct 2026 -> Monday 5 Oct, 00:00 Paris = 4 Oct 22:00 UTC.
    assert week_start(datetime(2026, 10, 7, 12, tzinfo=UTC)) == datetime(2026, 10, 4, 22)


def test_a_week_reuses_what_it_opens() -> None:
    data = MealPlanIn(servings=2, equipment=["plaques", "four"])
    meals = catalog.compose(data, rng=random.Random(4))  # noqa: S311 — a fixed test week
    basics = {catalog._fold(b) for b in catalog._BASICS}
    names = [{catalog._fold(i.product_name) for i in m.ingredients} - basics for m in meals]
    shared = sum(1 for i, n in enumerate(names) if any(n & other for other in names[:i]))
    # Most meals share at least one ingredient with an earlier one.
    assert shared >= len(meals) // 2
