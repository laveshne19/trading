"""Small shared helpers (time/session utilities)."""
from __future__ import annotations

from datetime import datetime

import pytz

from app.config import settings

_TZ = pytz.timezone(settings.timezone)


def now_ist() -> datetime:
    """Current time in the configured (IST) timezone."""
    return datetime.now(_TZ)


def is_market_open(now: datetime | None = None, include_mcx: bool = True) -> bool:
    """Whether any tradable session (equity or MCX) is currently open.

    Mon–Fri only. Equity 09:15–15:30; MCX runs into the evening.
    """
    now = now or now_ist()
    if now.weekday() >= 5:  # Sat/Sun
        return False
    t = now.time()
    if settings.equity_start_t <= t <= settings.equity_end_t:
        return True
    if include_mcx and settings.equity_start_t <= t <= settings.mcx_end_t:
        return True
    return False


def round_to_tick(price: float, tick: float = 0.05) -> float:
    """Round a price to the nearest valid exchange tick."""
    if tick <= 0:
        return round(price, 2)
    return round(round(price / tick) * tick, 2)
