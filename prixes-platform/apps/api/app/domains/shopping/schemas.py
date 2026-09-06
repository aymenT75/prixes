"""Shopping-list + basket-optimizer schemas."""
from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

ItemSource = Literal["manual", "ai", "recipe", "mealplan"]


class ShoppingItemIn(BaseModel):
    # Either a catalog barcode or a free-text label — the same rule the database
    # enforces, checked here so the caller gets a 422 instead of a 500.
    barcode: str | None = Field(default=None, min_length=4, max_length=32)
    free_text: str | None = Field(default=None, min_length=1, max_length=200)
    quantity: int = Field(default=1, ge=1, le=99)
    name: str | None = None
    amount: Decimal | None = Field(default=None, gt=0, le=9999)
    unit: str | None = Field(default=None, max_length=16)
    source: ItemSource = "manual"

    @model_validator(mode="after")
    def _one_identifier(self) -> ShoppingItemIn:
        if not self.barcode and not self.free_text:
            raise ValueError("barcode ou free_text est obligatoire")
        return self


class ShoppingItemUpdate(BaseModel):
    quantity: int | None = Field(default=None, ge=1, le=99)
    checked: bool | None = None


class ShoppingItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    barcode: str | None
    quantity: int
    checked: bool
    name: str | None
    free_text: str | None = None
    amount: Decimal | None = None
    unit: str | None = None
    source: str = "manual"
    image_url: str | None = None
    best_price: Decimal | None = None
    nutriscore: str | None = None
    # What the price is the price *of* ("500 g", "2 L"). Without it the list can
    # only say "0,75 € / u.", which reads as one leek rather than a 500 g bunch.
    pack: str | None = None


class ShoppingListOut(BaseModel):
    items: list[ShoppingItemOut]
    total: int


class BulkAddIn(BaseModel):
    """Add a whole basket at once — what the assistant and the meal planner use."""

    items: list[ShoppingItemIn] = Field(min_length=1, max_length=60)


class BulkAddOut(BaseModel):
    added: int
    merged: int
    items: list[ShoppingItemOut]


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


class BasketLine(BaseModel):
    """One line of a basket that isn't (yet) a saved shopping list."""

    barcode: str = Field(min_length=4, max_length=32)
    quantity: int = Field(default=1, ge=1, le=99)
    label: str | None = None


class OptimizeBasketIn(BaseModel):
    lines: list[BasketLine] = Field(min_length=1, max_length=80)


# ── Répartition entre magasins ──
class BasketItem(BaseModel):
    """One line, assigned to the store where you should actually buy it."""

    barcode: str
    label: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal


class StoreBasketDetail(BaseModel):
    store: str
    items: list[BasketItem]
    subtotal: Decimal


class SplitOption(BaseModel):
    """What the shop looks like if you agree to visit `len(stores)` stores."""

    stores: list[str]
    baskets: list[StoreBasketDetail]
    total: Decimal
    items_covered: int
    items_total: int
    # Priced items none of the chosen stores sells — you'd buy these elsewhere.
    missing: list[str]
    # Against the best single-store shop, and only when both plans fill the same
    # basket. Comparing a 5-item trip to an 8-item one prices two different shops.
    saving_vs_single: Decimal | None = None
    # How many more items this plan finds than the best single store. When this is
    # positive the extra stop is not about price at all — it is what completes the
    # shopping, and the higher total is the cost of the items you were missing.
    extra_items: int = 0


class SplitResult(BaseModel):
    # Ordered by number of stores: one, then two. Empty when nothing is priced.
    options: list[SplitOption]
    # Lines we have no price for anywhere, including free-text ones.
    unpriced: list[str]
