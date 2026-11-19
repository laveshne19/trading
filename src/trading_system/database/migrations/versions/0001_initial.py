"""Initial schema: candles_1m, option_instruments, orders, trades.

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-19

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "candles_1m",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("symbol", sa.String(64), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("open", sa.Numeric(18, 4), nullable=False),
        sa.Column("high", sa.Numeric(18, 4), nullable=False),
        sa.Column("low", sa.Numeric(18, 4), nullable=False),
        sa.Column("close", sa.Numeric(18, 4), nullable=False),
        sa.Column("volume", sa.BigInteger, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("symbol", "ts", name="uq_candles_1m_symbol_ts"),
    )
    op.create_index(
        "ix_candles_1m_symbol_ts", "candles_1m", ["symbol", "ts"]
    )

    op.create_table(
        "option_instruments",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("exchange", sa.String(8), nullable=False),
        sa.Column("trading_symbol", sa.String(64), nullable=False),
        sa.Column("underlying", sa.String(32), nullable=False),
        sa.Column("expiry", sa.DateTime(timezone=True), nullable=False),
        sa.Column("strike", sa.Numeric(18, 2), nullable=False),
        sa.Column("option_type", sa.String(2), nullable=False),
        sa.Column("lot_size", sa.Integer, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "exchange", "trading_symbol", name="uq_option_exchange_symbol"
        ),
        sa.CheckConstraint(
            "option_type IN ('CE','PE')", name="ck_option_type"
        ),
    )
    op.create_index(
        "ix_option_underlying_expiry_strike",
        "option_instruments",
        ["underlying", "expiry", "strike"],
    )

    op.create_table(
        "trades",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("underlying", sa.String(32), nullable=False),
        sa.Column("trading_symbol", sa.String(64), nullable=False),
        sa.Column("mode", sa.String(16), nullable=False),
        sa.Column("direction", sa.String(8), nullable=False),
        sa.Column("timeframe", sa.String(4), nullable=False),
        sa.Column("quantity", sa.Integer, nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("exit_reason", sa.String(32), nullable=True),
        sa.Column("entry_price_option", sa.Numeric(18, 4), nullable=True),
        sa.Column("exit_price_option", sa.Numeric(18, 4), nullable=True),
        sa.Column("entry_price_underlying", sa.Numeric(18, 4), nullable=True),
        sa.Column("exit_price_underlying", sa.Numeric(18, 4), nullable=True),
        sa.Column("gross_pnl", sa.Numeric(18, 4), nullable=True),
        sa.Column("friction", sa.Numeric(18, 4), nullable=True),
        sa.Column("net_pnl", sa.Numeric(18, 4), nullable=True),
        sa.Column(
            "is_paper", sa.Boolean, nullable=False, server_default=sa.false()
        ),
        sa.Column(
            "whipsaw", sa.Boolean, nullable=False, server_default=sa.false()
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_trades_opened_at", "trades", ["opened_at"])
    op.create_index(
        "ix_trades_underlying_opened", "trades", ["underlying", "opened_at"]
    )

    op.create_table(
        "orders",
        sa.Column("id", sa.BigInteger, primary_key=True),
        sa.Column("reference_id", sa.String(64), nullable=False),
        sa.Column("broker_order_id", sa.String(64), nullable=True),
        sa.Column(
            "trade_id",
            sa.BigInteger,
            sa.ForeignKey("trades.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("trading_symbol", sa.String(64), nullable=False),
        sa.Column("exchange", sa.String(8), nullable=False),
        sa.Column("segment", sa.String(16), nullable=False),
        sa.Column("side", sa.String(4), nullable=False),
        sa.Column("quantity", sa.Integer, nullable=False),
        sa.Column("product", sa.String(8), nullable=False),
        sa.Column("order_type", sa.String(8), nullable=False),
        sa.Column("validity", sa.String(8), nullable=False),
        sa.Column("price", sa.Numeric(18, 4), nullable=True),
        sa.Column("trigger_price", sa.Numeric(18, 4), nullable=True),
        sa.Column(
            "status", sa.String(16), nullable=False, server_default="NEW"
        ),
        sa.Column(
            "filled_quantity",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column("avg_fill_price", sa.Numeric(18, 4), nullable=True),
        sa.Column(
            "is_paper", sa.Boolean, nullable=False, server_default=sa.false()
        ),
        sa.Column("raw_payload", postgresql.JSONB, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("reference_id", name="uq_orders_reference_id"),
        sa.CheckConstraint("side IN ('BUY','SELL')", name="ck_orders_side"),
    )
    op.create_index("ix_orders_broker_id", "orders", ["broker_order_id"])
    op.create_index("ix_orders_trade_id", "orders", ["trade_id"])


def downgrade() -> None:
    op.drop_table("orders")
    op.drop_table("trades")
    op.drop_table("option_instruments")
    op.drop_table("candles_1m")
