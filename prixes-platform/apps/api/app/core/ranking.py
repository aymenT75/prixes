"""Deal feed ranking — Reddit/Dealabs-style time-decayed hotness (ARCHITECTURE.md §7)."""
from __future__ import annotations

import math
from datetime import UTC, datetime

# Epoch base ~ project launch; keeps scores in a sane range.
EPOCH_BASE = datetime(2025, 1, 1, tzinfo=UTC).timestamp()
GRAVITY = 45000.0  # larger = slower decay


def hot_score(votes_up: int, votes_down: int, created_at: datetime) -> float:
    net = votes_up - votes_down
    order = math.log10(max(abs(net), 1))
    sign = 1 if net > 0 else (-1 if net < 0 else 0)
    seconds = created_at.timestamp() - EPOCH_BASE
    return round(sign * order + seconds / GRAVITY, 6)
