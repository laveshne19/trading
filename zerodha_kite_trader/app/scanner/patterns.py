"""Pure-function pattern detectors operating on OHLCV DataFrames.

Each detector returns ``(detected: bool, direction: Side | None, strength: float)``
where strength is a 0..1 normalised confidence used later by the scorer.
They are deliberately side-effect free and individually unit-testable.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.domain import Side
from app.indicators import atr, ema, relative_volume, rsi, supertrend

DetectorResult = tuple[bool, "Side | None", float]


def _clip01(x: float) -> float:
    return float(max(0.0, min(1.0, x)))


def detect_breakout(df: pd.DataFrame, lookback: int = 20) -> DetectorResult:
    """Close breaking the rolling high/low of the last ``lookback`` bars."""
    if len(df) < lookback + 2:
        return False, None, 0.0
    window = df.iloc[-(lookback + 1):-1]
    last_close = df["close"].iloc[-1]
    hi = window["high"].max()
    lo = window["low"].min()
    rng = max(hi - lo, 1e-9)
    if last_close > hi:
        return True, Side.BUY, _clip01((last_close - hi) / rng * 5)
    if last_close < lo:
        return True, Side.SELL, _clip01((lo - last_close) / rng * 5)
    return False, None, 0.0


def detect_volume_surge(df: pd.DataFrame, period: int = 20, threshold: float = 2.0) -> DetectorResult:
    """Relative volume spike, directed by the candle's body."""
    if len(df) < period + 1:
        return False, None, 0.0
    rvol = relative_volume(df["volume"], period).iloc[-1]
    if not np.isfinite(rvol) or rvol < threshold:
        return False, None, 0.0
    body = df["close"].iloc[-1] - df["open"].iloc[-1]
    direction = Side.BUY if body >= 0 else Side.SELL
    return True, direction, _clip01((rvol - threshold) / threshold)


def detect_momentum(df: pd.DataFrame, period: int = 14) -> DetectorResult:
    """RSI-driven momentum in the direction of the trend."""
    if len(df) < period + 2:
        return False, None, 0.0
    r = rsi(df["close"], period).iloc[-1]
    if not np.isfinite(r):
        return False, None, 0.0
    if r >= 60:
        return True, Side.BUY, _clip01((r - 60) / 40)
    if r <= 40:
        return True, Side.SELL, _clip01((40 - r) / 40)
    return False, None, 0.0


def detect_reversal(df: pd.DataFrame, period: int = 14) -> DetectorResult:
    """Oversold/overbought RSI turning back — counter-trend reversal."""
    if len(df) < period + 3:
        return False, None, 0.0
    r = rsi(df["close"], period)
    last, prev = r.iloc[-1], r.iloc[-2]
    if not (np.isfinite(last) and np.isfinite(prev)):
        return False, None, 0.0
    if prev < 30 and last > prev:
        return True, Side.BUY, _clip01((30 - prev) / 30)
    if prev > 70 and last < prev:
        return True, Side.SELL, _clip01((prev - 70) / 30)
    return False, None, 0.0


def detect_trend_continuation(df: pd.DataFrame) -> DetectorResult:
    """Supertrend + EMA alignment agreeing on an established trend."""
    if len(df) < 60:
        return False, None, 0.0
    st = supertrend(df["high"], df["low"], df["close"])
    direction = int(st["direction"].iloc[-1])
    e20 = ema(df["close"], 20).iloc[-1]
    e50 = ema(df["close"], 50).iloc[-1]
    if direction == 1 and e20 > e50:
        return True, Side.BUY, _clip01((e20 - e50) / e50 * 20)
    if direction == -1 and e20 < e50:
        return True, Side.SELL, _clip01((e50 - e20) / e50 * 20)
    return False, None, 0.0


def detect_volatility_expansion(df: pd.DataFrame, period: int = 14) -> DetectorResult:
    """ATR expanding vs its own average — vol breakout regardless of direction."""
    if len(df) < period * 3:
        return False, None, 0.0
    a = atr(df["high"], df["low"], df["close"], period)
    cur = a.iloc[-1]
    avg = a.rolling(period).mean().iloc[-1]
    if not (np.isfinite(cur) and np.isfinite(avg)) or avg <= 0:
        return False, None, 0.0
    ratio = cur / avg
    if ratio < 1.5:
        return False, None, 0.0
    body = df["close"].iloc[-1] - df["close"].iloc[-period]
    direction = Side.BUY if body >= 0 else Side.SELL
    return True, direction, _clip01((ratio - 1.5) / 1.5)


ALL_DETECTORS = {
    "BREAKOUT": detect_breakout,
    "VOLUME_SURGE": detect_volume_surge,
    "MOMENTUM": detect_momentum,
    "REVERSAL": detect_reversal,
    "TREND_CONTINUATION": detect_trend_continuation,
    "VOLATILITY_EXPANSION": detect_volatility_expansion,
}
