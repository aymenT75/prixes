"""A dictated line matches the thing asked for, in a sensible pack size."""
from __future__ import annotations

from decimal import Decimal

from app.domains.products.models import Product
from app.domains.shopping.equivalents import key_words
from app.domains.smartcart.resolve import fit_penalty


def p(name: str, quantity: str | None) -> Product:
    return Product(barcode=name, name=name, quantity=quantity)


def test_a_six_pack_is_not_one_litre() -> None:
    needed = (Decimal("1"), "L")
    keys = key_words("lait")
    assert fit_penalty("lait", keys, needed, p("Lait demi-écrémé", "1 L")) == 0
    assert fit_penalty("lait", keys, needed, p("Lait demi-écrémé", "6 x 1 L")) > 0


def test_rice_is_not_a_rice_drink() -> None:
    needed = (Decimal("0.5"), "kg")
    keys = key_words("riz")
    assert fit_penalty("riz", keys, needed, p("Riz basmati", "500 g")) == 0
    assert fit_penalty("riz", keys, needed, p("Boisson riz nature", "1 L")) > 0.4


def test_coconut_milk_is_not_milk() -> None:
    assert fit_penalty("lait", key_words("lait"), None, p("Lait de coco", "400 ml")) > 0
