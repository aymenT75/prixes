"""Which aisle a product is in, so the in-store guide walks the shop in order.

The catalogue's categories are a mix of Open Food Facts slugs
("dairies", "plant-based-foods-and-beverages"), French labels
("Produits laitiers") and the odd English name, so the match is on keywords in
the categories and, when they say nothing useful, in the product's name.

The order is the usual walk through a French supermarket: fresh produce at the
entrance, then bread, the chilled aisles, the butcher and fishmonger, the dry
groceries, drinks, the freezers and, last, the non-food aisles.
"""

from __future__ import annotations

import unicodedata

# (aisle, keywords) in walking order. The first aisle with a matching keyword wins.
AISLES: list[tuple[str, tuple[str, ...]]] = [
    ("Fruits et légumes", ("fruit", "legume", "vegetable", "salade", "pomme", "banane",
                           "tomate", "carotte", "courgette", "oignon", "citron", "orange",
                           "poivron", "pomme de terre", "potato", "avocat", "champignon")),
    ("Boulangerie", ("boulangerie", "bread", "pain", "baguette", "viennoiser", "brioche",
                     "crepes-and-galettes", "crepe")),
    ("Frais", ("dairies", "dairy", "laitier", "lait", "yaourt", "yogurt", "fromage", "cheese",
               "beurre", "butter", "creme", "cream", "oeuf", "egg", "jambon", "sandwich",
               "fresh", "frais")),
    ("Boucherie et poissonnerie", ("meat", "viande", "boucherie", "poulet", "chicken", "boeuf",
                                   "porc", "steak", "saucisse", "seafood", "fish", "poisson",
                                   "saumon", "thon", "crevette")),
    ("Surgelés", ("frozen", "surgel", "glace", "ice-cream")),
    ("Épicerie salée", ("pates", "pasta", "riz", "rice", "conserve", "canned", "condiment",
                        "sauce", "huile", "oil", "fats", "farine", "flour", "meals", "plats",
                        "soupe", "epice", "spice", "sel", "dried", "cooking", "legumineuse",
                        "chips", "aperitif", "cereal")),
    ("Épicerie sucrée", ("snack", "biscuit", "gateau", "chocolat", "chocolate", "sucre",
                         "sugar", "sweet", "confiture", "spread", "pate a tartiner",
                         "petit-dejeuner", "breakfast", "cafe", "coffee", "the ", "tea",
                         "dessert", "miel", "honey", "bonbon", "candy", "baby-food")),
    ("Boissons", ("beverage", "boisson", "drink", "eau", "water", "jus", "juice", "soda",
                  "vin", "wine", "biere", "beer", "sirop")),
    ("Hygiène et maison", ("hygiene", "hair", "beaute", "beauty", "suncare", "savon", "soap",
                           "lessive", "detergent", "home", "maison", "non-food", "papier",
                           "dog-and-cat", "animal")),
]
OTHER = "Autres rayons"
ORDER = {name: i for i, (name, _) in enumerate(AISLES)} | {OTHER: len(AISLES)}


def _plain(text: str | None) -> str:
    """Lower case, no accents: "Crème fraîche" and "creme fraiche" match alike."""
    if not text:
        return ""
    decomposed = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def _match(text: str) -> str | None:
    if not text:
        return None
    for aisle, words in AISLES:
        if any(w in text for w in words):
            return aisle
    return None


def aisle_for(barcode: str, categories: str | None, name: str | None) -> str:
    """The aisle to look in for this product."""
    # Loose fruit and vegetables are catalogued from Open Prices as "fl:<slug>".
    if barcode.startswith("fl:"):
        return AISLES[0][0]
    # The name is more specific than the catalogue's broad slugs: the huge
    # "plant-based-foods-and-beverages" bucket holds pasta, coffee and apples alike.
    return _match(_plain(name)) or _match(_plain(categories)) or OTHER
