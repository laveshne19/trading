"""Breakout strategy: Opening Range Breakout, volume breakout, day-high breakout."""
from __future__ import annotations

import pandas as pd

from app.domain import Opportunity, ProductType, Side, Signal, SignalType, TradingType
from app.indicators import relative_volume
from app.strategies.base import Strategy


class BreakoutStrategy(Strategy):
    name = "breakout"
    default_product = ProductType.MIS
    default_trading_type = TradingType.INTRADAY
    atr_stop_mult = 1.2
    atr_target_mult = 2.5

    def __init__(self, opening_range_bars: int = 15, min_rvol: float = 1.5) -> None:
        self._or_bars = opening_range_bars
        self._min_rvol = min_rvol

    def applies_to(self, opp: Opportunity) -> bool:
        return opp.signal_type in (
            SignalType.BREAKOUT,
            SignalType.VOLUME_SURGE,
            SignalType.VOLATILITY_EXPANSION,
        )

    def build_signal(self, opp: Opportunity, df: pd.DataFrame) -> Signal | None:
        if len(df) < max(self._or_bars + 2, 25):
            return None
        last_close = float(df["close"].iloc[-1])
        rvol = float(relative_volume(df["volume"]).iloc[-1])

        # Opening range (first N bars of the available window) breakout.
        opening = df.iloc[: self._or_bars]
        or_high = float(opening["high"].max())
        or_low = float(opening["low"].min())
        day_high = float(df["high"].iloc[:-1].max())
        day_low = float(df["low"].iloc[:-1].min())

        bullish = (
            opp.direction is Side.BUY
            and (last_close > or_high or last_close >= day_high)
            and rvol >= self._min_rvol
        )
        bearish = (
            opp.direction is Side.SELL
            and (last_close < or_low or last_close <= day_low)
            and rvol >= self._min_rvol
        )
        if bullish:
            return self._make_signal(opp, df, Side.BUY,
                                     f"Breakout above {or_high:.2f}/{day_high:.2f}, rvol={rvol:.1f}")
        if bearish:
            return self._make_signal(opp, df, Side.SELL,
                                     f"Breakdown below {or_low:.2f}/{day_low:.2f}, rvol={rvol:.1f}")
        return None
