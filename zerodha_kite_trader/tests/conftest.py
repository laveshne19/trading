"""Shared pytest fixtures and synthetic data generators."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest


def _ohlcv(prices: np.ndarray, volume: np.ndarray | None = None) -> pd.DataFrame:
    n = len(prices)
    idx = pd.date_range("2024-01-01", periods=n, freq="1min")
    high = prices * (1 + 0.002)
    low = prices * (1 - 0.002)
    open_ = np.concatenate([[prices[0]], prices[:-1]])
    vol = volume if volume is not None else np.full(n, 10_000.0)
    return pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": prices, "volume": vol},
        index=idx,
    )


@pytest.fixture
def uptrend_df() -> pd.DataFrame:
    prices = np.linspace(100, 160, 300) + np.sin(np.linspace(0, 20, 300))
    return _ohlcv(prices)


@pytest.fixture
def downtrend_df() -> pd.DataFrame:
    prices = np.linspace(160, 100, 300) + np.sin(np.linspace(0, 20, 300))
    return _ohlcv(prices)


@pytest.fixture
def choppy_df() -> pd.DataFrame:
    rng = np.random.default_rng(7)
    prices = 100 + np.cumsum(rng.normal(0, 0.3, 300))
    return _ohlcv(prices)


@pytest.fixture
def breakout_df() -> pd.DataFrame:
    flat = np.full(40, 100.0) + np.random.default_rng(1).normal(0, 0.2, 40)
    pop = np.linspace(100, 112, 10)
    prices = np.concatenate([flat, pop])
    vol = np.concatenate([np.full(40, 10_000.0), np.full(10, 50_000.0)])
    return _ohlcv(prices, vol)
