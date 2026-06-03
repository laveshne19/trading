"""Technical indicators.

Uses TA-Lib when available (fast C implementation); otherwise falls back to
vectorised pandas/numpy implementations so the system runs anywhere without
the native dependency. All functions accept and return pandas objects.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

try:  # pragma: no cover - depends on host
    import talib  # type: ignore

    _HAS_TALIB = True
except Exception:  # pragma: no cover
    talib = None  # type: ignore
    _HAS_TALIB = False


def sma(series: pd.Series, period: int) -> pd.Series:
    """Simple moving average."""
    if _HAS_TALIB:
        return pd.Series(talib.SMA(series.to_numpy(dtype=float), timeperiod=period), index=series.index)
    return series.rolling(window=period, min_periods=period).mean()


def ema(series: pd.Series, period: int) -> pd.Series:
    """Exponential moving average."""
    if _HAS_TALIB:
        return pd.Series(talib.EMA(series.to_numpy(dtype=float), timeperiod=period), index=series.index)
    return series.ewm(span=period, adjust=False, min_periods=period).mean()


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Relative Strength Index (Wilder)."""
    if _HAS_TALIB:
        return pd.Series(talib.RSI(series.to_numpy(dtype=float), timeperiod=period), index=series.index)
    delta = series.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss
    result = 100.0 - (100.0 / (1.0 + rs))
    # No losses in the window → RSI = 100 (still NaN during warmup).
    no_loss = (avg_loss == 0) & avg_gain.notna()
    result = result.mask(no_loss, 100.0)
    # No movement at all → neutral 50.
    flat = (avg_loss == 0) & (avg_gain == 0)
    result = result.mask(flat, 50.0)
    return result


def macd(
    series: pd.Series,
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> pd.DataFrame:
    """MACD line, signal line and histogram."""
    if _HAS_TALIB:
        macd_line, signal_line, hist = talib.MACD(
            series.to_numpy(dtype=float), fastperiod=fast, slowperiod=slow, signalperiod=signal
        )
        return pd.DataFrame(
            {"macd": macd_line, "signal": signal_line, "hist": hist}, index=series.index
        )
    fast_ema = ema(series, fast)
    slow_ema = ema(series, slow)
    macd_line = fast_ema - slow_ema
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    return pd.DataFrame(
        {"macd": macd_line, "signal": signal_line, "hist": macd_line - signal_line}
    )


def atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Average True Range."""
    if _HAS_TALIB:
        return pd.Series(
            talib.ATR(
                high.to_numpy(dtype=float),
                low.to_numpy(dtype=float),
                close.to_numpy(dtype=float),
                timeperiod=period,
            ),
            index=close.index,
        )
    prev_close = close.shift(1)
    tr = pd.concat(
        [(high - low), (high - prev_close).abs(), (low - prev_close).abs()], axis=1
    ).max(axis=1)
    return tr.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()


def bollinger_bands(
    series: pd.Series, period: int = 20, num_std: float = 2.0
) -> pd.DataFrame:
    """Bollinger Bands: middle (SMA), upper, lower."""
    middle = sma(series, period)
    std = series.rolling(window=period, min_periods=period).std(ddof=0)
    upper = middle + num_std * std
    lower = middle - num_std * std
    return pd.DataFrame({"middle": middle, "upper": upper, "lower": lower})


def supertrend(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    period: int = 10,
    multiplier: float = 3.0,
) -> pd.DataFrame:
    """Supertrend indicator.

    Returns a DataFrame with ``supertrend`` (the line) and ``direction``
    (+1 for uptrend / bullish, -1 for downtrend / bearish).
    """
    atr_series = atr(high, low, close, period)
    hl2 = (high + low) / 2.0
    upper_basic = hl2 + multiplier * atr_series
    lower_basic = hl2 - multiplier * atr_series

    n = len(close)
    upper_arr = upper_basic.to_numpy(dtype=float, copy=True)
    lower_arr = lower_basic.to_numpy(dtype=float, copy=True)
    close_arr = close.to_numpy(dtype=float, copy=True)

    for i in range(1, n):
        if close_arr[i - 1] <= upper_arr[i - 1]:
            upper_arr[i] = min(upper_arr[i], upper_arr[i - 1])
        if close_arr[i - 1] >= lower_arr[i - 1]:
            lower_arr[i] = max(lower_arr[i], lower_arr[i - 1])

    direction = np.ones(n, dtype=int)
    st = np.full(n, np.nan)
    for i in range(1, n):
        if np.isnan(upper_arr[i]) or np.isnan(lower_arr[i]):
            continue
        if close_arr[i] > upper_arr[i - 1]:
            direction[i] = 1
        elif close_arr[i] < lower_arr[i - 1]:
            direction[i] = -1
        else:
            direction[i] = direction[i - 1]
        st[i] = lower_arr[i] if direction[i] == 1 else upper_arr[i]

    return pd.DataFrame(
        {"supertrend": st, "direction": direction}, index=close.index
    )


def vwap(df: pd.DataFrame) -> pd.Series:
    """Intraday VWAP. Expects columns: high, low, close, volume.

    Should be computed per trading session (reset daily).
    """
    typical = (df["high"] + df["low"] + df["close"]) / 3.0
    cum_vol = df["volume"].cumsum()
    cum_pv = (typical * df["volume"]).cumsum()
    return cum_pv / cum_vol.replace(0.0, np.nan)


def relative_volume(volume: pd.Series, period: int = 20) -> pd.Series:
    """Relative volume: current volume / average volume over ``period``."""
    avg = volume.rolling(window=period, min_periods=1).mean()
    return volume / avg.replace(0.0, np.nan)


def ema_alignment(close: pd.Series) -> int:
    """+1 if EMA20>EMA50>EMA200 (bullish stack), -1 if inverse, else 0."""
    e20 = ema(close, 20).iloc[-1]
    e50 = ema(close, 50).iloc[-1]
    e200 = ema(close, 200).iloc[-1] if len(close) >= 200 else e50
    if e20 > e50 > e200:
        return 1
    if e20 < e50 < e200:
        return -1
    return 0
