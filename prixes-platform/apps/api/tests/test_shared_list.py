"""A list shared with family: the invite code and the notification text."""
from __future__ import annotations

from app.domains.shopping import share


def test_codes_avoid_letters_people_misread() -> None:
    for _ in range(200):
        code = share.new_code()
        assert len(code) == share.CODE_LENGTH
        assert not set(code) & set("01OIL")


def test_a_dictated_or_typed_code_is_found_however_it_was_written() -> None:
    assert share.normalise_code("k7 4m2") == "K74M2"
    assert share.normalise_code(" K7-4M2 ") == "K74M2"


def test_one_notification_says_who_added_and_what() -> None:
    assert share.added_text("Marie", ["Yaourts nature"])[1] == "Marie a ajouté Yaourts nature"
    assert share.added_text("Marie", ["Lait", "Pain", "Œufs"])[1] == (
        "Marie a ajouté 3 produits à la liste"
    )
