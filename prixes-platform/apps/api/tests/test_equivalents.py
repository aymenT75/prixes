from app.domains.shopping.equivalents import acceptable, key_words


def test_key_words_keep_what_the_product_is():
    assert key_words("Lait demi-écrémé Lactel 1L") == ["lait", "demi", "ecreme"]
    assert key_words("Pâtes de blé 500 g") == ["pates", "ble"]


def test_same_product_another_brand_is_accepted():
    keys = key_words("Lait demi-écrémé Lactel 1L")
    assert acceptable("Lait demi-écrémé Lactel 1L", "Lait UHT demi écrémé Candia", keys)


def test_milk_never_becomes_coconut_milk():
    keys = key_words("Lait")
    assert not acceptable("Lait", "Lait de coco crémeux", keys)
    assert acceptable("Lait de coco", "Lait de coco bio", key_words("Lait de coco"))


def test_every_key_word_must_be_there():
    keys = key_words("Yaourt nature")
    assert not acceptable("Yaourt nature", "Yaourt à la fraise", keys)


def test_the_equivalent_is_the_same_kind_of_thing() -> None:
    assert not acceptable("Olives noires", "Tapenade Olives noires", key_words("Olives noires"))
    assert not acceptable("Persil", "Le Gourmand Soja, Poivre et Persil", key_words("Persil"))
    assert acceptable("Riz", "Riz long grain", key_words("Riz"))
    assert acceptable("Emmental râpé", "Emmental français râpé", key_words("Emmental râpé"))
