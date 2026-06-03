"""Tests for technical indicators."""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.indicators import atr, bollinger_bands, ema, macd, rsi, sma, supertrend, vwap
from app.indicators.technical import ema_alignment, relative_volume


def test_sma_basic():
    s = pd.Series([1, 2, 3, 4, 5], dtype=float)
    result = sma(s, 2)
    assert result.iloc[-1] == 4.5


def test_ema_responds_faster_than_sma():
    # Step change up: a few bars after the jump, the faster EMA should sit
    # above the lagging SMA.
    s = pd.Series(np.concatenate([np.full(20, 10.0), np.full(20, 20.0)]))
    idx = 24  # 5 bars after the jump at index 20
    assert ema(s, 10).iloc[idx] > sma(s, 10).iloc[idx]


def test_rsi_bounds(uptrend_df):
    r = rsi(uptrend_df["close"]).dropna()
    assert (r >= 0).all() and (r <= 100).all()
    # strong uptrend → RSI elevated
    assert r.iloc[-1] > 50


def test_rsi_downtrend(downtrend_df):
    r = rsi(downtrend_df["close"]).dropna()
    assert r.iloc[-1] < 50


def test_macd_columns(uptrend_df):
    m = macd(uptrend_df["close"])
    assert {"macd", "signal", "hist"}.issubset(m.columns)


def test_atr_positive(choppy_df):
    a = atr(choppy_df["high"], choppy_df["low"], choppy_df["close"]).dropna()
    assert (a > 0).all()


def test_bollinger_ordering(choppy_df):
    bb = bollinger_bands(choppy_df["close"]).dropna()
    assert (bb["upper"] >= bb["middle"]).all()
    assert (bb["middle"] >= bb["lower"]).all()


def test_supertrend_direction_values(uptrend_df):
    st = supertrend(uptrend_df["high"], uptrend_df["low"], uptrend_df["close"])
    assert set(np.unique(st["direction"])).issubset({-1, 1})
    # sustained uptrend should end bullish
    assert st["direction"].iloc[-1] == 1


def test_vwap_within_range(uptrend_df):
    v = vwap(uptrend_df).dropna()
    assert v.iloc[-1] > 0


def test_ema_alignment_uptrend(uptrend_df):
    assert ema_alignment(uptrend_df["close"]) == 1


def test_relative_volume(breakout_df):
    rv = relative_volume(breakout_df["volume"])
    assert rv.iloc[-1] > 1.0
