"""L'ordre des résultats de recherche.

The rule the ranking encodes: a price at a shop you cannot reach is not an
offer, and an unknown price must never be sorted as though it were zero.
"""
from __future__ import annotations

from decimal import Decimal

from app.domains.products.models import Product
from app.domains.products.service import RankedProduct, order_hits


def hit(name: str, price: str | None, store: str | None = None, nearby: bool = False):
    return RankedProduct(
        product=Product(barcode=name, name=name),
        best_price=Decimal(price) if price is not None else None,
        best_store=store,
        nearby=nearby,
    )


def names(hits: list[RankedProduct]) -> list[str]:
    return [h.product.name or "" for h in hits]


def test_the_cheapest_comes_first() -> None:
    assert names(order_hits([hit("cher", "3.20"), hit("pas cher", "1.10")])) == [
        "pas cher",
        "cher",
    ]


def test_a_nearby_shop_beats_a_cheaper_one_further_away() -> None:
    """1,10 € three towns away is not an offer; 1,80 € down the road is."""
    ordered = order_hits(
        [hit("ailleurs", "1.10", "Cora"), hit("à côté", "1.80", "Lidl", nearby=True)]
    )
    assert names(ordered) == ["à côté", "ailleurs"]


def test_among_nearby_shops_the_cheapest_still_wins() -> None:
    ordered = order_hits(
        [
            hit("nearby cher", "2.50", "Lidl", nearby=True),
            hit("nearby pas cher", "0.90", "Auchan", nearby=True),
            hit("loin", "0.50", "Cora"),
        ]
    )
    assert names(ordered) == ["nearby pas cher", "nearby cher", "loin"]


def test_a_product_with_no_known_price_goes_last() -> None:
    """Never sorted as if it cost nothing."""
    ordered = order_hits([hit("sans prix", None), hit("avec prix", "4.00")])
    assert names(ordered) == ["avec prix", "sans prix"]


def test_unpriced_products_keep_the_relevance_order_they_arrived_in() -> None:
    ordered = order_hits([hit("premier", None), hit("second", None), hit("prix", "1.00")])
    assert names(ordered) == ["prix", "premier", "second"]


def test_an_empty_result_stays_empty() -> None:
    assert order_hits([]) == []
