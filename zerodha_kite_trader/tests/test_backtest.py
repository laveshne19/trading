"""Tests for the backtest engine and metrics."""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.backtest import BacktestEngine, compute_metrics
from app.backtest.metrics import max_drawdown
from app.data.instruments import make_equity_instrument


def test_max_drawdown_simple():
    curve = [100, 120, 90, 110]
    # peak 120 → trough 90 = 25%
    assert abs(max_drawdown(curve) - 0.25) < 1e-9


def test_compute_metrics_basic():
    curve = [100_000, 101_000, 102_500, 101_800, 104_000]
    pnls = [1_000, 1_500, -700, 2_200]
    m = compute_metrics(curve, pnls, days=len(curve))
    assert m.trades == 4
    assert 0 <= m.win_rate_pct <= 100
    assert m.profit_factor > 0
    assert m.total_return_pct > 0


def test_metrics_empty():
    m = compute_metrics([], [])
    assert m.trades == 0


def test_backtest_runs_and_reports():
    prices = 100 + np.cumsum(np.random.default_rng(3).normal(0.05, 1.0, 400))
    prices = np.maximum(prices, 1.0)
    idx = pd.date_range("2024-01-01", periods=len(prices), freq="1D")
    df = pd.DataFrame(
        {
            "open": np.concatenate([[prices[0]], prices[:-1]]),
            "high": prices * 1.01,
            "low": prices * 0.99,
            "close": prices,
            "volume": np.full(len(prices), 100_000.0),
        },
        index=idx,
    )
    engine = BacktestEngine(starting_capital=100_000)
    result = engine.run(make_equity_instrument("TEST"), df)
    summary = result.summary()
    assert "cagr_pct" in summary
    assert "max_drawdown_pct" in summary
    assert isinstance(result.trades, list)
    assert len(result.equity_curve) > 0
