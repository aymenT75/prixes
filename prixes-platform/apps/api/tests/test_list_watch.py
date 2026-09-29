"""The app acting on its own: list price drops and the Sunday menu (pure parts)."""
from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from app.domains.mealplan.auto import next_monday
from app.domains.mealplan.schemas import MealPreferences
from app.domains.shopping import watch


def test_a_drop_worth_telling_is_ten_centimes_or_five_percent() -> None:
    assert watch.worth_telling(Decimal("3.99"), Decimal("3.59"))  # 40 c
    assert watch.worth_telling(Decimal("1.00"), Decimal("0.95"))  # 5 %
    assert not watch.worth_telling(Decimal("3.99"), Decimal("3.95"))  # 4 c, 1 %
    assert not watch.worth_telling(Decimal("2.00"), Decimal("2.10"))  # a rise
    assert not watch.worth_telling(Decimal("2.00"), Decimal("2.00"))


def test_one_notification_groups_every_drop() -> None:
    one = [{"name": "Café", "old": "3.99", "new": "3.59"}]
    assert watch.push_text(one)[1] == "Café : 3,59 € (−0,40 €)"
    many = [{"name": n, "old": "2", "new": "1"} for n in ["Café", "Beurre", "Lait", "Pain", "Riz"]]
    assert watch.push_text(many)[1] == "5 produits ont baissé : Café, Beurre, Lait et 2 autres"


def test_no_notification_at_night_in_france() -> None:
    assert watch._quiet_hours(datetime(2026, 9, 29, 5, 0, tzinfo=UTC))  # 07:00 Paris
    assert not watch._quiet_hours(datetime(2026, 9, 29, 10, 0, tzinfo=UTC))  # 12:00
    assert watch._quiet_hours(datetime(2026, 9, 29, 20, 0, tzinfo=UTC))  # 22:00
    # Winter time: 07:30 UTC is 08:30 in Paris in December, 09:30 in July.
    assert watch._paris_hour(datetime(2026, 12, 15, 7, 30, tzinfo=UTC)) == 8
    assert watch._paris_hour(datetime(2026, 7, 15, 7, 30, tzinfo=UTC)) == 9
    # The switch days: 29 March 2026 and 25 October 2026, at 01:00 UTC.
    assert watch._paris_hour(datetime(2026, 3, 29, 0, 59, tzinfo=UTC)) == 1
    assert watch._paris_hour(datetime(2026, 3, 29, 1, 0, tzinfo=UTC)) == 3
    assert watch._paris_hour(datetime(2026, 10, 25, 1, 0, tzinfo=UTC)) == 2


def test_the_sunday_menu_is_for_the_week_that_starts_tomorrow() -> None:
    assert next_monday(date(2026, 10, 4)) == date(2026, 10, 5)  # Sunday → Monday
    assert next_monday(date(2026, 9, 29)) == date(2026, 10, 5)  # Tuesday → next Monday


def test_saved_questionnaires_without_the_new_fields_still_load() -> None:
    """Preferences saved before the Sunday menu existed: off, no allergens."""
    prefs = MealPreferences.model_validate({"servings": 4, "meals_per_day": 1})
    assert prefs.auto_week is False
    assert prefs.avoid_allergens == [] and prefs.diets == []
