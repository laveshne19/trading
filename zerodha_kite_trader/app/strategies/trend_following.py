"""Trend-following strategy: EMA 20/50/200 stack + Supertrend confirmation."""
from __future__ import annotations

import pandas as pd

from app.domain import Opportunity, ProductType, Side, Signal, SignalType, TradingType
from app.indicators import ema, supertrend
from app.indicators.technical import ema_alignment
from app.strategies.base import Strategy


class TrendFollowingStrategy(Strategy):
    name = "trend_following"
    default_product = ProductType.MIS
    default_trading_type = TradingType.INTRADAY
    atr_stop_mult = 1.5
    atr_target_mult = 3.0

    def applies_to(self, opp: Opportunity) -> bool:
        return opp.signal_type in (
            SignalType.TREND_CONTINUATION,
            SignalType.MOMENTUM,
        )

    def build_signal(self, opp: Opportunity, df: pd.DataFrame) -> Signal | None:
        if len(df) < 60:
            return None
        alignment = ema_alignment(df["close"])
        st = supertrend(df["high"], df["low"], df["close"])
        direction = int(st["direction"].iloc[-1])
        e20 = ema(df["close"], 20).iloc[-1]
        e50 = ema(df["close"], 50).iloc[-1]

        if opp.direction is Side.BUY and alignment >= 0 and direction == 1 and e20 > e50:
            return self._make_signal(opp, df, Side.BUY,
                                     "EMA stack bullish + Supertrend up")
        if opp.direction is Side.SELL and alignment <= 0 and direction == -1 and e20 < e50:
            return self._make_signal(opp, df, Side.SELL,
                                     "EMA stack bearish + Supertrend down")
        return None
