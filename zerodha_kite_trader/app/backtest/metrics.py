"""Performance metrics for backtests and live tracking.

CAGR, Sharpe, Sortino, max drawdown, win rate, profit factor, expectancy.
All operate on either an equity curve or a list of per-trade returns.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

_TRADING_DAYS = 252


@dataclass
class Metrics:
    total_return_pct: float = 0.0
    cagr_pct: float = 0.0
    sharpe: float = 0.0
    sortino: float = 0.0
    max_drawdown_pct: float = 0.0
    win_rate_pct: float = 0.0
    profit_factor: float = 0.0
    expectancy: float = 0.0
    trades: int = 0
    avg_win: float = 0.0
    avg_loss: float = 0.0

    def as_dict(self) -> dict[str, float | int]:
        return {
            "total_return_pct": round(self.total_return_pct, 2),
            "cagr_pct": round(self.cagr_pct, 2),
            "sharpe": round(self.sharpe, 2),
            "sortino": round(self.sortino, 2),
            "max_drawdown_pct": round(self.max_drawdown_pct, 2),
            "win_rate_pct": round(self.win_rate_pct, 2),
            "profit_factor": round(self.profit_factor, 2),
            "expectancy": round(self.expectancy, 2),
            "trades": self.trades,
            "avg_win": round(self.avg_win, 2),
            "avg_loss": round(self.avg_loss, 2),
        }


def max_drawdown(equity_curve: list[float]) -> float:
    """Maximum peak-to-trough drawdown as a positive fraction (0..1)."""
    if not equity_curve:
        return 0.0
    peak = equity_curve[0]
    max_dd = 0.0
    for v in equity_curve:
        peak = max(peak, v)
        if peak > 0:
            max_dd = max(max_dd, (peak - v) / peak)
    return max_dd


def _annualised_sharpe(returns: np.ndarray, risk_free: float = 0.0) -> float:
    if returns.size < 2:
        return 0.0
    excess = returns - risk_free / _TRADING_DAYS
    std = excess.std(ddof=1)
    if std == 0:
        return 0.0
    return float(excess.mean() / std * math.sqrt(_TRADING_DAYS))


def _annualised_sortino(returns: np.ndarray, risk_free: float = 0.0) -> float:
    if returns.size < 2:
        return 0.0
    excess = returns - risk_free / _TRADING_DAYS
    downside = excess[excess < 0]
    dd = downside.std(ddof=1) if downside.size > 1 else 0.0
    if dd == 0:
        return 0.0
    return float(excess.mean() / dd * math.sqrt(_TRADING_DAYS))


def compute_metrics(
    equity_curve: list[float],
    trade_pnls: list[float],
    periods_per_year: int = _TRADING_DAYS,
    days: int | None = None,
) -> Metrics:
    """Compute the full metric set.

    ``equity_curve`` — equity sampled per period (e.g. daily).
    ``trade_pnls`` — net P&L per closed trade (currency).
    """
    m = Metrics()
    if not equity_curve:
        return m

    start, end = equity_curve[0], equity_curve[-1]
    if start > 0:
        m.total_return_pct = (end / start - 1.0) * 100.0

    # Period returns for risk ratios.
    eq = np.asarray(equity_curve, dtype=float)
    rets = np.diff(eq) / eq[:-1] if eq.size > 1 else np.array([])
    m.sharpe = _annualised_sharpe(rets) if rets.size else 0.0
    m.sortino = _annualised_sortino(rets) if rets.size else 0.0
    m.max_drawdown_pct = max_drawdown(equity_curve) * 100.0

    # CAGR.
    n_days = days if days is not None else len(equity_curve)
    years = max(n_days / periods_per_year, 1e-9)
    if start > 0 and end > 0:
        m.cagr_pct = ((end / start) ** (1.0 / years) - 1.0) * 100.0

    # Trade-level stats.
    if trade_pnls:
        arr = np.asarray(trade_pnls, dtype=float)
        wins = arr[arr > 0]
        losses = arr[arr < 0]
        m.trades = int(arr.size)
        m.win_rate_pct = wins.size / arr.size * 100.0
        gross_profit = float(wins.sum())
        gross_loss = float(-losses.sum())
        m.profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else float("inf")
        m.avg_win = float(wins.mean()) if wins.size else 0.0
        m.avg_loss = float(losses.mean()) if losses.size else 0.0
        m.expectancy = float(arr.mean())
    return m
