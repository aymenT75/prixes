"""Dish photos — one per title, kept on disk, never a reason for a menu to fail."""
from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app.core.config import settings
from app.domains.mealplan import images


def test_case_accents_and_spacing_share_one_photo() -> None:
    a = images.image_key("Poêlée de légumes, riz")
    b = images.image_key("  poelee DE legumes riz ")
    assert a == b
    assert images.KEY_PATTERN.match(a)


def test_different_dishes_get_different_photos() -> None:
    assert images.image_key("Curry de pois chiches") != images.image_key("Chili sin carne")


def test_a_key_can_never_name_a_path() -> None:
    for name in ("../../etc/passwd", "abc", "A" * 24, "0" * 23 + "/"):
        assert not images.KEY_PATTERN.match(name)


def test_an_existing_photo_is_served_without_a_key_or_a_call(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "meal_image_dir", str(tmp_path))
    monkeypatch.setattr(settings, "openai_api_key", "")
    key = images.image_key("Gratin dauphinois")
    (tmp_path / f"{key}.webp").write_bytes(b"RIFF")
    assert asyncio.run(images.photo_for("gratin  dauphinois")) == images.image_url(key)


def test_no_key_means_no_photo_not_an_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "meal_image_dir", str(tmp_path))
    monkeypatch.setattr(settings, "openai_api_key", "")
    assert asyncio.run(images.photo_for("Tajine de poulet")) is None


def test_a_spent_cap_draws_nothing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "meal_image_dir", str(tmp_path))
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")

    async def no_slot() -> bool:
        return False

    async def must_not_run(title: str) -> bytes:
        raise AssertionError("the cap was spent, nothing should be drawn")

    monkeypatch.setattr(images, "_take_daily_slot", no_slot)
    monkeypatch.setattr(images, "_generate", must_not_run)
    assert asyncio.run(images.photo_for("Tajine de poulet")) is None


def test_a_drawn_photo_is_kept_and_not_drawn_twice(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "meal_image_dir", str(tmp_path))
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    calls: list[str] = []

    async def slot() -> bool:
        return True

    async def draw(title: str) -> bytes:
        calls.append(title)
        return b"RIFF-webp"

    monkeypatch.setattr(images, "_take_daily_slot", slot)
    monkeypatch.setattr(images, "_generate", draw)

    async def two_cards_at_once() -> list[str | None]:
        return list(
            await asyncio.gather(
                images.photo_for("Soupe de potiron"), images.photo_for("soupe de potiron")
            )
        )

    first, second = asyncio.run(two_cards_at_once())
    assert first == second is not None
    assert calls == ["Soupe de potiron"]
    assert not list(tmp_path.glob("*.tmp")), "no half-written file left behind"


def test_a_failed_drawing_leaves_no_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "meal_image_dir", str(tmp_path))
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")

    async def slot() -> bool:
        return True

    async def fail(title: str) -> None:
        return None

    monkeypatch.setattr(images, "_take_daily_slot", slot)
    monkeypatch.setattr(images, "_generate", fail)
    assert asyncio.run(images.photo_for("Risotto")) is None
    assert not list(tmp_path.iterdir())
