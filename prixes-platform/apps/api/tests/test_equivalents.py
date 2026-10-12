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


def test_a_prepared_product_is_not_the_raw_one() -> None:
    assert not acceptable("Carottes", "CAROTTES râpées", key_words("Carottes"))
    assert not acceptable("Poulet", "Poulet rôti mayonnaise", key_words("Poulet"))
    assert not acceptable("Tomates", "Tomates basilic", key_words("Tomates"))
    assert acceptable("Carottes râpées", "Carottes râpées bio", key_words("Carottes râpées"))
    assert acceptable("Salade", "Salade mélangée", key_words("Salade"))


def test_a_ready_meal_is_not_the_ingredient() -> None:
    assert not acceptable("Poulet", "Poulet Curry Coco riz blanc", key_words("Poulet"))
    assert not acceptable("Poulet", "Le poulet patates pour 1 pers", key_words("Poulet"))
    assert not acceptable("Poulet", "Poulet basquaise", key_words("Poulet"))
    assert not acceptable(
        "Poulet", "Le Poulet tandoori semoule aux petits légumes", key_words("Poulet")
    )
    assert not acceptable("Tomates", "Tomates entières pelées", key_words("Tomates"))
    # A variety and a size are fine.
    assert acceptable("Tomates", "Tomates cerises", key_words("Tomates"))
    assert acceptable("Lait", "Lait demi écrémé", key_words("Lait"))
