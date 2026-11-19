"""Typed broker payloads.

The Groww SDK returns raw ``dict``s. These dataclasses give us a stable,
documented surface that the strategy and persistence layers can rely on
without reaching into untyped broker responses.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class OrderSide(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class OrderStatus(str, Enum):
    NEW = "NEW"
    PENDING = "PENDING"
    PLACED = "PLACED"
    EXECUTED = "EXECUTED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    UNKNOWN = "UNKNOWN"

    @classmethod
    def from_raw(cls, value: str | None) -> "OrderStatus":
        if not value:
            return cls.UNKNOWN
        try:
            return cls(value.upper())
        except ValueError:
            return cls.UNKNOWN


class CandleInterval(str, Enum):
    """Groww candle intervals. Keep in sync with GrowwAPI.CANDLE_INTERVAL_*."""

    MIN_1 = "1minute"
    MIN_2 = "2minute"
    MIN_3 = "3minute"
    MIN_5 = "5minute"
    MIN_10 = "10minute"
    MIN_15 = "15minute"
    MIN_30 = "30minute"
    HOUR_1 = "1hour"
    HOUR_4 = "4hour"
    DAY = "1day"


@dataclass(frozen=True, slots=True)
class UserProfile:
    user_id: str
    name: str | None
    email: str | None
    raw: dict  # full broker payload for diagnostics


@dataclass(frozen=True, slots=True)
class MarginDetails:
    available_margin: float
    used_margin: float
    raw: dict


@dataclass(frozen=True, slots=True)
class Quote:
    trading_symbol: str
    exchange: str
    ltp: float
    bid: float | None
    ask: float | None
    volume: int | None
    raw: dict


@dataclass(frozen=True, slots=True)
class Candle:
    """One OHLCV bar from the broker.

    ``ts`` is the bar's open time, always in exchange-local time
    (IST for Groww). Volume may be absent for index candles.
    """

    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int | None


@dataclass(frozen=True, slots=True)
class OptionContract:
    trading_symbol: str
    exchange: str
    underlying: str
    expiry: str  # ISO date string YYYY-MM-DD
    strike: float
    option_type: str  # "CE" or "PE"
    lot_size: int
    raw: dict


@dataclass(frozen=True, slots=True)
class OrderRequest:
    """Immutable intent: what the strategy wants to place.

    Separating this from the broker's own dict keeps the strategy
    testable without spinning up the real client.
    """

    trading_symbol: str
    exchange: str
    segment: str
    side: OrderSide
    quantity: int
    product: str
    order_type: str
    validity: str
    price: float | None = None
    trigger_price: float | None = None
    reference_id: str | None = None


@dataclass(frozen=True, slots=True)
class PlacedOrder:
    broker_order_id: str
    reference_id: str | None
    status: OrderStatus
    raw: dict
