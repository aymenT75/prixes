"""Dish photos — one per title, kept on disk, never a reason for a menu to fail."""
from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app.core.config import settings
from app.domains.mealplan import images

# A body that starts like a real JPEG.
JPEG = bytes([0xFF, 0xD8, 0xFF]) + b"-jpeg"


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
    monkeypatch.setattr(settings, "cloudflare_ai_token", "")
    key = images.image_key("Gratin dauphinois")
    (tmp_path / f"{key}.webp").write_bytes(b"RIFF")
    assert asyncio.run(images.photo_for("gratin  dauphinois")) == images.image_url(key, "webp")


def test_no_key_means_no_photo_not_an_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "meal_image_dir", str(tmp_path))
    monkeypatch.setattr(settings, "cloudflare_ai_token", "")
    assert asyncio.run(images.photo_for("Tajine de poulet")) is None


def test_a_spent_cap_draws_nothing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "meal_image_dir", str(tmp_path))
    monkeypatch.setattr(settings, "cloudflare_account_id", "acc")
    monkeypatch.setattr(settings, "cloudflare_ai_token", "cf-test")

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
    monkeypatch.setattr(settings, "cloudflare_account_id", "acc")
    monkeypatch.setattr(settings, "cloudflare_ai_token", "cf-test")
    calls: list[str] = []

    async def slot() -> bool:
        return True

    async def draw(title: str) -> bytes:
        calls.append(title)
        return JPEG

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
    assert first.endswith(".jpg"), "a JPEG is stored and served as a JPEG"
    assert calls == ["Soupe de potiron"]
    assert not list(tmp_path.glob("*.tmp")), "no half-written file left behind"


def test_a_failed_drawing_leaves_no_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "meal_image_dir", str(tmp_path))
    monkeypatch.setattr(settings, "cloudflare_account_id", "acc")
    monkeypatch.setattr(settings, "cloudflare_ai_token", "cf-test")

    async def slot() -> bool:
        return True

    async def fail(title: str) -> None:
        return None

    monkeypatch.setattr(images, "_take_daily_slot", slot)
    monkeypatch.setattr(images, "_generate", fail)
    assert asyncio.run(images.photo_for("Risotto")) is None
    assert not list(tmp_path.iterdir())


class _Resp:
    def __init__(self, status: int, headers: dict[str, str] | None = None) -> None:
        self.status_code = status
        self.headers = headers or {}
        self.text = ""

    def json(self) -> dict[str, object]:
        import base64

        return {"result": {"image": base64.b64encode(JPEG).decode()}}


def _client(responses: list[_Resp], calls: list[int]):
    class Client:
        async def post(self, *args: object, **kwargs: object) -> _Resp:
            calls.append(1)
            return responses.pop(0)

    return lambda: Client()


def test_a_rate_limit_is_retried_once(monkeypatch: pytest.MonkeyPatch) -> None:
    """The bug seen in prod: seven photos at once, one refused with 429, card left bare."""
    calls: list[int] = []
    responses = [_Resp(429, {"retry-after": "0"}), _Resp(200)]
    monkeypatch.setattr(images, "get_http_client", _client(responses, calls))
    monkeypatch.setattr(images, "_retry_delay", lambda h: 0)
    assert asyncio.run(images._generate("Riz sauté aux légumes")) == JPEG
    assert len(calls) == 2


def test_a_second_rate_limit_gives_up(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[int] = []
    monkeypatch.setattr(images, "get_http_client", _client([_Resp(429), _Resp(429)], calls))
    monkeypatch.setattr(images, "_retry_delay", lambda h: 0)
    assert asyncio.run(images._generate("Riz sauté aux légumes")) is None
    assert len(calls) == 2


def test_other_errors_are_not_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[int] = []
    monkeypatch.setattr(images, "get_http_client", _client([_Resp(400)], calls))
    assert asyncio.run(images._generate("Riz")) is None
    assert len(calls) == 1


def test_retry_delay_is_bounded() -> None:
    assert images._retry_delay(None) == 5.0
    assert images._retry_delay("1") == 2.0
    assert images._retry_delay("120") == 20.0
    assert images._retry_delay("demain") == 5.0


def test_an_unknown_format_is_not_kept(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """A body that is not an image (an HTML error page, say) must never be served."""
    monkeypatch.setattr(settings, "meal_image_dir", str(tmp_path))
    monkeypatch.setattr(settings, "cloudflare_account_id", "acc")
    monkeypatch.setattr(settings, "cloudflare_ai_token", "cf-test")

    async def slot() -> bool:
        return True

    async def html(title: str) -> bytes:
        return b"<html>quota</html>"

    monkeypatch.setattr(images, "_take_daily_slot", slot)
    monkeypatch.setattr(images, "_generate", html)
    assert asyncio.run(images.photo_for("Risotto")) is None
    assert not list(tmp_path.iterdir())


def test_the_cap_stays_inside_the_free_allocation() -> None:
    """~58 neurons per 1024px FLUX schnell image at 4 steps; 10,000 free a day."""
    assert settings.meal_image_daily_cap * 58 < 10_000
