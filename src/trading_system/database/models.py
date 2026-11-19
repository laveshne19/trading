"""ORM models for the trading system.

Stage 1 covers the four tables we need to start:

* ``candles_1m`` — raw 1-minute OHLCV for the underlying. All higher
  timeframes are resampled from this on the fly.
* ``option_instruments`` — cached option-chain contracts so we can
  resolve strike -> trading_symbol fast during live trading.
* ``orders`` — every order we send to the broker, with status
  transitions and the broker payload.
* ``trades`` — entry/exit pairs linking orders into a strategy trade.

Signal, strategy-run audit, and kill-switch tables land in Stage 2/3
to avoid shipping schema for logic that doesn't exist yet.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)

# SQLite only auto-increments INTEGER PRIMARY KEY, not BIGINT. The
# migrations still generate BIGSERIAL on Postgres; this variant keeps
# the ORM mapping usable from SQLite-backed unit tests.
PkBigInt = BigInteger().with_variant(Integer(), "sqlite")
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
)


class Base(DeclarativeBase):
    """SQLAlchemy declarative base. Use this when adding new models."""


# -------------------------------------------------------------- candles


class Candle1m(Base):
    """One 1-minute OHLCV bar for an underlying.

    We only store one timeframe (1m) and resample up to 5m/15m/30m at
    query time. Keeps storage simple and lets us change higher-TF
    alignment logic without a backfill.
    """

    __tablename__ = "candles_1m"
    __table_args__ = (
        UniqueConstraint("symbol", "ts", name="uq_candles_1m_symbol_ts"),
        Index("ix_candles_1m_symbol_ts", "symbol", "ts"),
    )

    id: Mapped[int] = mapped_column(PkBigInt, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(64), nullable=False)
    ts: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, doc="Bar open time (IST)"
    )
    open: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    high: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    low: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    close: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    volume: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
    )

    def __repr__(self) -> str:  # pragma: no cover - debug aid only
        return f"Candle1m({self.symbol} {self.ts:%Y-%m-%d %H:%M} c={self.close})"


# -------------------------------------------------------- option cache


class OptionInstrument(Base):
    """Cached option-chain row keyed by trading symbol.

    Rebuilt daily from Groww's option chain. Live trading resolves
    strike -> trading_symbol by querying this table, so we don't
    round-trip to the broker on every entry decision.
    """

    __tablename__ = "option_instruments"
    __table_args__ = (
        UniqueConstraint(
            "exchange", "trading_symbol", name="uq_option_exchange_symbol"
        ),
        Index(
            "ix_option_underlying_expiry_strike",
            "underlying",
            "expiry",
            "strike",
        ),
        CheckConstraint("option_type IN ('CE','PE')", name="ck_option_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    exchange: Mapped[str] = mapped_column(String(8), nullable=False)
    trading_symbol: Mapped[str] = mapped_column(String(64), nullable=False)
    underlying: Mapped[str] = mapped_column(String(32), nullable=False)
    expiry: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    strike: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    option_type: Mapped[str] = mapped_column(
        String(2), nullable=False, doc="'CE' or 'PE'"
    )
    lot_size: Mapped[int] = mapped_column(Integer, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )


# ----------------------------------------------------------- order log


class Order(Base):
    """Every order we send to the broker.

    One row per place_order attempt; status is updated as the broker
    responds. ``raw_payload`` stores the last broker response for
    forensic debugging — we never try to normalize every field.
    """

    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("reference_id", name="uq_orders_reference_id"),
        Index("ix_orders_broker_id", "broker_order_id"),
        Index("ix_orders_trade_id", "trade_id"),
        CheckConstraint("side IN ('BUY','SELL')", name="ck_orders_side"),
    )

    id: Mapped[int] = mapped_column(PkBigInt, primary_key=True)
    reference_id: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        doc="Our idempotency key; also sent to the broker",
    )
    broker_order_id: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True
    )
    trade_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("trades.id", ondelete="SET NULL"), nullable=True
    )

    trading_symbol: Mapped[str] = mapped_column(String(64), nullable=False)
    exchange: Mapped[str] = mapped_column(String(8), nullable=False)
    segment: Mapped[str] = mapped_column(String(16), nullable=False)
    side: Mapped[str] = mapped_column(String(4), nullable=False)  # BUY/SELL
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    product: Mapped[str] = mapped_column(String(8), nullable=False)
    order_type: Mapped[str] = mapped_column(String(8), nullable=False)
    validity: Mapped[str] = mapped_column(String(8), nullable=False)
    price: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4))
    trigger_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4))

    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="NEW"
    )
    filled_quantity: Mapped[int] = mapped_column(Integer, default=0)
    avg_fill_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4))

    is_paper: Mapped[bool] = mapped_column(
        default=False,
        doc="True if this was simulated (paper trading), never sent to broker",
    )
    raw_payload: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    trade: Mapped[Optional["Trade"]] = relationship(
        back_populates="orders", foreign_keys=[trade_id]
    )


# ---------------------------------------------------------- trade pair


class Trade(Base):
    """A strategy trade: one entry + (optionally) one exit.

    Opens as entry-only; exit fields fill in once the opposite
    crossover or 15:00 square-off closes the position. Links back to
    the broker orders for the full execution trail.
    """

    __tablename__ = "trades"
    __table_args__ = (
        Index("ix_trades_opened_at", "opened_at"),
        Index("ix_trades_underlying_opened", "underlying", "opened_at"),
    )

    id: Mapped[int] = mapped_column(PkBigInt, primary_key=True)

    underlying: Mapped[str] = mapped_column(
        String(32), nullable=False, doc="e.g. NIFTY"
    )
    trading_symbol: Mapped[str] = mapped_column(String(64), nullable=False)
    mode: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        doc="ITM5_BUY / ATM_BUY / ATM_SELL",
    )
    direction: Mapped[str] = mapped_column(
        String(8), nullable=False, doc="LONG / SHORT (on the underlying)"
    )
    timeframe: Mapped[str] = mapped_column(
        String(4), nullable=False, doc="5m / 15m / 30m"
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    closed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    exit_reason: Mapped[Optional[str]] = mapped_column(
        String(32),
        nullable=True,
        doc="opposite_cross / square_off / kill_switch / manual",
    )

    entry_price_option: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 4)
    )
    exit_price_option: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 4)
    )
    entry_price_underlying: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 4)
    )
    exit_price_underlying: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(18, 4)
    )

    gross_pnl: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4))
    friction: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4))
    net_pnl: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4))

    is_paper: Mapped[bool] = mapped_column(default=False)
    whipsaw: Mapped[bool] = mapped_column(
        default=False,
        doc="True if this trade flipped into its reverse inside the window",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )

    orders: Mapped[list["Order"]] = relationship(
        back_populates="trade",
        primaryjoin="Trade.id == foreign(Order.trade_id)",
    )
