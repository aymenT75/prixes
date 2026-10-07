from app.domains.shopping.aisles import ORDER, OTHER, aisle_for


def test_loose_produce_is_at_the_entrance():
    assert aisle_for("fl:pomme", None, "Pommes Gala") == "Fruits et légumes"


def test_name_beats_a_broad_category():
    # Open Food Facts files pasta and coffee alike under "plant-based-foods".
    broad = "plant-based-foods-and-beverages"
    assert aisle_for("1", broad, "Pâtes sans gluten") == "Épicerie salée"
    assert aisle_for("2", broad, "Café moulu") == "Épicerie sucrée"


def test_category_when_the_name_says_nothing():
    assert aisle_for("3", "dairies", "Le Bon Vivant") == "Frais"
    assert aisle_for("4", "frozen-foods", "Marque X") == "Surgelés"


def test_unknown_goes_last():
    assert aisle_for("5", None, "Zzz") == OTHER
    assert ORDER[OTHER] == max(ORDER.values())
