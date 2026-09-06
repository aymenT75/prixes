"""Price plausibility bound at ingestion — data-quality risk #1 in the SIT audit
(a €0.85 item recorded as €850, a lot priced as a unit, a currency slip)."""
from __future__ import annotations

from decimal import Decimal

import pytest

from app.domains.products.ingest import is_plausible_price
from app.domains.products.units import parse_quantity, unit_price


@pytest.mark.parametrize("price", [0.01, 0.85, 3.20, 49.99, 250.0, 1000.0])
def test_plausible_grocery_prices_accepted(price: float) -> None:
    assert is_plausible_price(price) is True


@pytest.mark.parametrize("price", [0.0, -1.0, 1000.01, 8500.0, 85000.0])
def test_implausible_prices_rejected(price: float) -> None:
    assert is_plausible_price(price) is False


def test_below_one_cent_rounds_and_is_rejected() -> None:
    # 0.004 rounds to 0.00, below the 0.01 floor.
    assert is_plausible_price(0.004) is False


# ── Store names: one chain, one name ─────────────────────────────────────────
@pytest.mark.parametrize(
    ("raw", "canon"),
    [
        ("E.Leclerc", "E.Leclerc"),
        ("E. Leclerc", "E.Leclerc"),            # the space that split a chain in two
        ("Centre Commercial E.Leclerc", "E.Leclerc"),
        ("Intermarché", "Intermarché"),
        ("Intermarché Express", "Intermarché"),
        ("Intermarché Super", "Intermarché"),
        ("Carrefour Market", "Carrefour"),
        ("Hyper U", "Super U"),
        ("LIDL FRANCE", "Lidl"),
    ],
)
def test_every_spelling_of_a_chain_folds_onto_one_name(raw: str, canon: str) -> None:
    """Two spellings meant the basket splitter sent you to "two stores" that were
    the same shop, to save 19 cents."""
    from app.domains.products.ingest import canon_store_name

    assert canon_store_name(raw) == canon


def test_netto_stays_its_own_store() -> None:
    """Intermarché owns it, but it is a different brand with its own prices — you
    cannot buy an Intermarché price at a Netto."""
    from app.domains.products.ingest import canon_store_name

    assert canon_store_name("Netto") == "Netto"


def test_an_unknown_shop_keeps_its_name() -> None:
    from app.domains.products.ingest import canon_store_name

    assert canon_store_name("Maxi Zoo") == "Maxi Zoo"


# ── Un prix au kilo absurde vient d'un poids absurde ─────────────────────────
def test_a_one_gram_pack_is_not_believed() -> None:
    """« Pommes de terre 1 g » affichait un sac à 0,99 € comme « 990,00 €/kg »."""
    assert parse_quantity("1 g") is None
    assert unit_price(Decimal("0.99"), "1 g") is None


@pytest.mark.parametrize("quantity", ["500 g", "1 kg", "33 cl", "1,5 L", "6 x 33 cl"])
def test_real_grocery_packs_still_parse(quantity: str) -> None:
    assert parse_quantity(quantity) is not None
