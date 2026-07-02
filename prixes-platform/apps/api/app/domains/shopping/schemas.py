"""Shopping-list + basket-optimizer schemas."""
from __future__ import annotations

import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ShoppingItemIn(BaseModel):
    barcode: str = Field(min_length=4, max_length=32)
    quantity: int = Field(default=1, ge=1, le=99)
    name: str | None = None


class ShoppingItemUpdate(BaseModel):
    quantity: int | None = Field(default=None, ge=1, le=99)
    checked: bool | None = None


class ShoppingItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    barcode: str
    quantity: int
    checked: bool
    name: str | None
    image_url: str | None = None
    best_price: Decimal | None = None


class ShoppingListOut(BaseModel):
    items: list[ShoppingItemOut]
    total: int


# ── Basket optimizer ──
class StoreBasket(BaseModel):
    store: str
    total: Decimal            # cost of the items this store has
    items_covered: int        # how many distinct list items are available here
    items_total: int          # size of the (priced) list
    missing: list[str]        # names/barcodes not sold at this store


class OptimizeResult(BaseModel):
    # Cheapest single store that has everything (if any).
    best_single_store: StoreBasket | None = None
    # Every store ranked by coverage then total.
    by_store: list[StoreBasket]
    # Theoretical cheapest if you split across stores (best price per item).
    cheapest_split_total: Decimal | None = None
    priced_items: int
    unpriced_items: int
