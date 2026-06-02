"""Repository helpers — thin persistence functions over the ORM models.

Keeps SQLAlchemy specifics out of the business logic. Every function manages
its own transactional scope.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta

from sqlalchemy import Integer, case, func, select

from app.db.models import (
    MLPredictionRow,
    OrderRow,
    PerformanceMetricRow,
    SignalRow,
    StrategyLogRow,
    TradeRow,
)
from app.db.session import session_scope
from app.domain import OrderRequest, OrderResult, Position, Signal


def save_signal(signal: Signal, acted_upon: bool = False) -> int:
    with session_scope() as s:
        row = SignalRow(
            tradingsymbol=signal.instrument.tradingsymbol,
            exchange=signal.instrument.exchange.value,
            strategy=signal.strategy,
            signal_type=signal.meta.get("signal_type", ""),
            side=signal.side.value,
            entry_price=signal.entry_price,
            stop_loss=signal.stop_loss,
            target=signal.target,
            opportunity_score=signal.opportunity_score,
            ml_confidence=signal.ml_confidence,
            reward_risk=signal.reward_risk_ratio,
            acted_upon=acted_upon,
            rationale=signal.rationale,
        )
        s.add(row)
        s.flush()
        return row.id


def save_order(request: OrderRequest, result: OrderResult, strategy: str = "") -> int:
    with session_scope() as s:
        row = OrderRow(
            broker_order_id=result.order_id,
            tradingsymbol=request.instrument.tradingsymbol,
            exchange=request.instrument.exchange.value,
            side=request.side.value,
            order_type=request.order_type.value,
            product=request.product.value,
            quantity=request.quantity,
            price=request.price,
            trigger_price=request.trigger_price,
            status=result.status.value,
            filled_quantity=result.filled_quantity,
            average_price=result.average_price,
            message=result.message,
            strategy=strategy,
        )
        s.add(row)
        s.flush()
        return row.id


def open_trade(position: Position, signal_id: int | None = None) -> int:
    with session_scope() as s:
        row = TradeRow(
            tradingsymbol=position.instrument.tradingsymbol,
            exchange=position.instrument.exchange.value,
            strategy=position.strategy,
            side=position.side.value,
            quantity=position.quantity,
            entry_price=position.entry_price,
            stop_loss=position.stop_loss,
            target=position.target,
            status="OPEN",
            opened_at=position.opened_at,
            signal_id=signal_id,
        )
        s.add(row)
        s.flush()
        return row.id


def close_trade(
    trade_id: int, exit_price: float, pnl: float, charges: float, exit_reason: str
) -> None:
    with session_scope() as s:
        row = s.get(TradeRow, trade_id)
        if row is None:
            return
        row.exit_price = exit_price
        row.pnl = pnl
        row.charges = charges
        row.net_pnl = pnl - charges
        row.status = "CLOSED"
        row.exit_reason = exit_reason
        row.closed_at = datetime.utcnow()


def log_strategy(strategy: str, message: str, level: str = "INFO") -> None:
    with session_scope() as s:
        s.add(StrategyLogRow(strategy=strategy, message=message, level=level))


def save_ml_prediction(
    tradingsymbol: str,
    strategy: str,
    probability: float,
    expected_return: float,
    confidence: float,
    model_version: str,
    features: dict[str, float],
) -> None:
    with session_scope() as s:
        s.add(
            MLPredictionRow(
                tradingsymbol=tradingsymbol,
                strategy=strategy,
                probability=probability,
                expected_return=expected_return,
                confidence=confidence,
                model_version=model_version,
                features_json=json.dumps(features),
            )
        )


def record_performance(snapshot: dict[str, float | int], scope: str = "overall") -> None:
    with session_scope() as s:
        s.add(
            PerformanceMetricRow(
                scope=scope,
                equity=float(snapshot.get("equity", 0.0)),
                realized_pnl=float(snapshot.get("realized_pnl", 0.0)),
                unrealized_pnl=float(snapshot.get("unrealized_pnl", 0.0)),
                drawdown_pct=float(snapshot.get("drawdown_pct", 0.0)),
                win_rate=float(snapshot.get("win_rate", 0.0)),
                trades_count=int(snapshot.get("trades_count", 0)),
                profit_factor=float(snapshot.get("profit_factor", 0.0)),
            )
        )


# --- read-side (dashboard) -------------------------------------------------
def get_today_trades() -> list[TradeRow]:
    start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    with session_scope() as s:
        return list(s.scalars(select(TradeRow).where(TradeRow.opened_at >= start)))


def get_closed_trades(days: int = 30) -> list[TradeRow]:
    start = datetime.utcnow() - timedelta(days=days)
    with session_scope() as s:
        return list(
            s.scalars(
                select(TradeRow)
                .where(TradeRow.status == "CLOSED", TradeRow.closed_at >= start)
                .order_by(TradeRow.closed_at.desc())
            )
        )


def strategy_performance() -> list[dict[str, float | str | int]]:
    """Aggregate net P&L and win rate per strategy from closed trades."""
    with session_scope() as s:
        rows = s.execute(
            select(
                TradeRow.strategy,
                func.count(TradeRow.id),
                func.sum(TradeRow.net_pnl),
                func.sum(case((TradeRow.net_pnl > 0, 1), else_=0).cast(Integer)),
            )
            .where(TradeRow.status == "CLOSED")
            .group_by(TradeRow.strategy)
        ).all()
    result = []
    for strategy, count, net, wins in rows:
        count = count or 0
        result.append(
            {
                "strategy": strategy,
                "trades": int(count),
                "net_pnl": float(net or 0.0),
                "win_rate": (float(wins or 0) / count * 100.0) if count else 0.0,
            }
        )
    return result


def get_recent_signals(limit: int = 50) -> list[SignalRow]:
    with session_scope() as s:
        return list(
            s.scalars(select(SignalRow).order_by(SignalRow.created_at.desc()).limit(limit))
        )
