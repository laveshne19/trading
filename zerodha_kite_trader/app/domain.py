"""Core domain types shared across modules.

These are lightweight, framework-agnostic dataclasses/enums. SQLAlchemy ORM
models (persistence) live in ``app/db/models.py`` and map to/from these.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


# --------------------------------------------------------------------------- #
# Enums
# --------------------------------------------------------------------------- #
class Exchange(str, Enum):
    NSE = "NSE"
    NFO = "NFO"        # NSE F&O
    BSE = "BSE"
    MCX = "MCX"
    CDS = "CDS"


class Segment(str, Enum):
    EQUITY = "EQUITY"
    FUTURES = "FUTURES"
    OPTIONS = "OPTIONS"
    COMMODITY = "COMMODITY"


class Side(str, Enum):
    BUY = "BUY"
    SELL = "SELL"

    @property
    def opposite(self) -> Side:
        return Side.SELL if self is Side.BUY else Side.BUY

    @property
    def sign(self) -> int:
        return 1 if self is Side.BUY else -1


class ProductType(str, Enum):
    MIS = "MIS"        # intraday
    CNC = "CNC"        # delivery
    NRML = "NRML"      # positional F&O / commodity


class OrderType(str, Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    SL = "SL"          # stop-loss limit
    SLM = "SL-M"       # stop-loss market


class OrderStatus(str, Enum):
    PENDING = "PENDING"
    OPEN = "OPEN"
    COMPLETE = "COMPLETE"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    PARTIAL = "PARTIAL"


class TradingType(str, Enum):
    INTRADAY = "INTRADAY"
    POSITIONAL = "POSITIONAL"


class SignalType(str, Enum):
    BREAKOUT = "BREAKOUT"
    VOLUME_SURGE = "VOLUME_SURGE"
    MOMENTUM = "MOMENTUM"
    REVERSAL = "REVERSAL"
    TREND_CONTINUATION = "TREND_CONTINUATION"
    VOLATILITY_EXPANSION = "VOLATILITY_EXPANSION"


# --------------------------------------------------------------------------- #
# Data structures
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class Instrument:
    """A tradable instrument as known to Kite."""

    instrument_token: int
    tradingsymbol: str
    name: str
    exchange: Exchange
    segment: Segment
    lot_size: int = 1
    tick_size: float = 0.05
    expiry: datetime | None = None
    strike: float | None = None
    instrument_type: str = "EQ"  # EQ / FUT / CE / PE

    @property
    def is_derivative(self) -> bool:
        return self.segment in (Segment.FUTURES, Segment.OPTIONS, Segment.COMMODITY)


@dataclass
class Candle:
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    oi: float | None = None


@dataclass
class Quote:
    """A point-in-time market snapshot."""

    instrument_token: int
    last_price: float
    timestamp: datetime
    volume: float = 0.0
    oi: float = 0.0
    bid: float = 0.0
    ask: float = 0.0
    ohlc_open: float = 0.0
    ohlc_high: float = 0.0
    ohlc_low: float = 0.0
    ohlc_close: float = 0.0  # previous-day close


@dataclass
class Opportunity:
    """A scanner hit, enriched and scored before becoming a Signal."""

    instrument: Instrument
    signal_type: SignalType
    direction: Side
    score: float = 0.0
    reference_price: float = 0.0
    features: dict[str, float] = field(default_factory=dict)
    detected_at: datetime = field(default_factory=datetime.utcnow)
    notes: str = ""


@dataclass
class Signal:
    """A fully-formed trade intent produced by a strategy."""

    instrument: Instrument
    strategy: str
    side: Side
    entry_price: float
    stop_loss: float
    target: float
    product: ProductType
    trading_type: TradingType
    opportunity_score: float = 0.0
    ml_confidence: float = 0.0
    expected_return: float = 0.0
    rationale: str = ""
    created_at: datetime = field(default_factory=datetime.utcnow)
    meta: dict[str, Any] = field(default_factory=dict)

    @property
    def risk_per_unit(self) -> float:
        return abs(self.entry_price - self.stop_loss)

    @property
    def reward_per_unit(self) -> float:
        return abs(self.target - self.entry_price)

    @property
    def reward_risk_ratio(self) -> float:
        r = self.risk_per_unit
        return self.reward_per_unit / r if r > 0 else 0.0


@dataclass
class OrderRequest:
    instrument: Instrument
    side: Side
    quantity: int
    order_type: OrderType
    product: ProductType
    price: float = 0.0          # for LIMIT / SL
    trigger_price: float = 0.0  # for SL / SL-M
    tag: str = ""


@dataclass
class OrderResult:
    order_id: str
    status: OrderStatus
    filled_quantity: int = 0
    average_price: float = 0.0
    message: str = ""
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class Position:
    """A live open position managed by the portfolio."""

    instrument: Instrument
    side: Side
    quantity: int
    entry_price: float
    stop_loss: float
    target: float
    product: ProductType
    strategy: str
    trading_type: TradingType
    entry_order_id: str = ""
    opened_at: datetime = field(default_factory=datetime.utcnow)
    last_price: float = 0.0
    highest_price: float = 0.0   # for trailing (long)
    lowest_price: float = 0.0    # for trailing (short)
    trade_id: int | None = None

    def unrealized_pnl(self, price: float | None = None) -> float:
        p = price if price is not None else self.last_price
        return (p - self.entry_price) * self.side.sign * self.quantity

    @property
    def notional(self) -> float:
        return self.entry_price * self.quantity
