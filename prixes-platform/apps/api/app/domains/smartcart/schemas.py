"""Smart Assistant schemas.

Two families live here and they must not be confused.

``AiLine`` / ``AiDraft`` are the *contract imposed on the model*: their JSON
Schema is what we send to OpenAI or Anthropic, so every field has to be
expressible in strict mode. That is why amounts are plain floats — a Pydantic
``Decimal`` serialises to an ``anyOf[number, string]`` the providers reject.

``ResolvedLine`` / ``SmartCartOut`` are what *we* return, after our own code has
matched each line to the catalog and priced it. Money is Decimal there.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

Unit = Literal[
    "kg", "g", "L", "cl", "ml", "pièce", "tranche", "botte", "sachet", "boîte", "pot"
]

Category = Literal[
    "fruits-légumes",
    "boucherie",
    "poissonnerie",
    "crèmerie",
    "épicerie salée",
    "épicerie sucrée",
    "surgelés",
    "boissons",
    "boulangerie",
    "entretien",
]

# The model returns this exact title when the request has nothing to do with food
# shopping, instead of inventing a basket.
OFF_TOPIC = "HORS_SUJET"


# ── What the model must produce ──────────────────────────────────────────────
class AiLine(BaseModel):
    # Deliberately unconstrained: any bound written here would be stripped from
    # the schema we send (see core.llm._STRIP_KEYS) and would then reject an
    # otherwise fine answer for being one character too long. Bounds are applied
    # when the answer is read, in `resolve_lines`.
    product_name: str
    amount: float
    unit: Unit
    category: Category
    optional: bool = False


class AiDraft(BaseModel):
    title: str
    servings: int
    lines: list[AiLine]


# ── What the API exchanges ───────────────────────────────────────────────────
class SmartCartIn(BaseModel):
    prompt: str = Field(min_length=3, max_length=400)
    servings: int | None = Field(default=None, ge=1, le=50)
    # The allergen and diet profile lives in the browser (useA11y), so the client
    # sends it along. Lines whose match conflicts are flagged, never silently
    # swapped — the user decides.
    avoid_allergens: list[str] = Field(default_factory=list, max_length=20)
    diets: list[str] = Field(default_factory=list, max_length=10)


class ResolvedLine(BaseModel):
    # From the model.
    product_name: str
    amount: Decimal
    unit: str
    category: str
    optional: bool = False

    # From our catalog. barcode is None when nothing matched well enough — the
    # line still ships, as free text, so the user's list stays complete.
    barcode: str | None = None
    matched_name: str | None = None
    image_url: str | None = None
    best_price: Decimal | None = None
    unit_price: str | None = None
    # How many packs of the matched product cover `amount` `unit`.
    quantity: int = 1
    allergen_warning: str | None = None


class SmartCartOut(BaseModel):
    draft_id: str
    title: str
    servings: int
    lines: list[ResolvedLine]
    # Sum over resolved lines only. Always read alongside unpriced_count.
    estimated_total: Decimal | None = None
    matched_count: int
    unpriced_count: int
    cached: bool = False


class CommitLine(BaseModel):
    """One line as the user finally wants it — after any edits on screen."""

    barcode: str | None = Field(default=None, min_length=4, max_length=32)
    free_text: str | None = Field(default=None, min_length=1, max_length=200)
    name: str | None = Field(default=None, max_length=300)
    quantity: int = Field(default=1, ge=1, le=99)
    amount: Decimal | None = Field(default=None, gt=0, le=9999)
    unit: str | None = Field(default=None, max_length=16)


class CommitIn(BaseModel):
    lines: list[CommitLine] = Field(min_length=1, max_length=60)


class CommitOut(BaseModel):
    added: int
    merged: int
