"""Deal price validation (DealCreate schema) — catches the "promo" data-quality
risk the SIT audit flagged: a discount must actually be a discount."""
from __future__ import annotations

from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.domains.deals.schemas import DealCreate


def _deal(price_now: str, price_before: str) -> DealCreate:
    return DealCreate(
        title="Café moulu 250g",
        price_now=Decimal(price_now),
        price_before=Decimal(price_before),
    )


def test_valid_discount_accepted() -> None:
    deal = _deal("3.20", "3.80")
    assert deal.price_now < deal.price_before


def test_rejects_price_now_equal_to_price_before() -> None:
    """No real discount — must not be presentable as a deal."""
    with pytest.raises(ValidationError):
        _deal("3.80", "3.80")


def test_rejects_price_now_higher_than_price_before() -> None:
    """The classic bad-data case: old price lower than the 'promo' price."""
    with pytest.raises(ValidationError):
        _deal("4.50", "3.80")


def test_rejects_zero_or_negative_price() -> None:
    with pytest.raises(ValidationError):
        _deal("0", "3.80")
    with pytest.raises(ValidationError):
        _deal("-1", "3.80")
