"""Price plausibility bound at ingestion — data-quality risk #1 in the SIT audit
(a €0.85 item recorded as €850, a lot priced as a unit, a currency slip)."""
from __future__ import annotations

import pytest

from app.domains.products.ingest import is_plausible_price


@pytest.mark.parametrize("price", [0.01, 0.85, 3.20, 49.99, 250.0, 1000.0])
def test_plausible_grocery_prices_accepted(price: float) -> None:
    assert is_plausible_price(price) is True


@pytest.mark.parametrize("price", [0.0, -1.0, 1000.01, 8500.0, 85000.0])
def test_implausible_prices_rejected(price: float) -> None:
    assert is_plausible_price(price) is False


def test_below_one_cent_rounds_and_is_rejected() -> None:
    # 0.004 rounds to 0.00, below the 0.01 floor.
    assert is_plausible_price(0.004) is False
