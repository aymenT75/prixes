"""Price-alert trigger logic — the anti-duplicate-notification behaviour the SIT
audit specifically flagged as worth locking in with a real test. `_should_trigger`
is pure (no DB), so this needs no fixtures."""
from __future__ import annotations

from decimal import Decimal

from app.domains.alerts.models import PriceAlert
from app.domains.alerts.service import _should_trigger


def _alert(target_price: str | None, baseline_price: str | None) -> PriceAlert:
    return PriceAlert(
        target_price=Decimal(target_price) if target_price else None,
        baseline_price=Decimal(baseline_price) if baseline_price else None,
    )


def test_triggers_when_price_at_or_below_target() -> None:
    alert = _alert(target_price="3.00", baseline_price=None)
    assert _should_trigger(alert, Decimal("2.90")) is True
    assert _should_trigger(alert, Decimal("3.00")) is True  # inclusive


def test_does_not_trigger_above_target() -> None:
    alert = _alert(target_price="3.00", baseline_price=None)
    assert _should_trigger(alert, Decimal("3.10")) is False


def test_without_target_triggers_only_on_new_low() -> None:
    alert = _alert(target_price=None, baseline_price="5.00")
    assert _should_trigger(alert, Decimal("4.99")) is True
    assert _should_trigger(alert, Decimal("5.00")) is False  # not a *new* low
    assert _should_trigger(alert, Decimal("5.01")) is False


def test_without_target_or_baseline_never_triggers() -> None:
    """No baseline yet (first evaluation) — nothing to compare against, so no
    spurious notification on day one."""
    alert = _alert(target_price=None, baseline_price=None)
    assert _should_trigger(alert, Decimal("0.01")) is False
