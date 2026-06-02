"""MCX commodity strategy: momentum + trend following on commodity futures.

Commodities (GOLD, CRUDEOIL, etc.) trend strongly and trade later into the
evening, so this uses NRML product and a positional bias with wider ATR stops.
"""
from __future__ import annotations

import pandas as pd

from app.domain import (
    Exchange,
    Opportunity,
    ProductType,
    Side,
    Signal,
    SignalType,
    TradingType,
)
from app.indicators import ema, supertrend
from app.strategies.base import Strategy


class MCXStrategy(Strategy):
    name = "mcx_momentum"
    default_product = ProductType.NRML
    default_trading_type = TradingType.POSITIONAL
    atr_stop_mult = 2.0
    atr_target_mult = 4.0

    def applies_to(self, opp: Opportunity) -> bool:
        return (
            opp.instrument.exchange is Exchange.MCX
            and opp.signal_type in (
                SignalType.MOMENTUM,
                SignalType.TREND_CONTINUATION,
                SignalType.BREAKOUT,
            )
        )

    def build_signal(self, opp: Opportunity, df: pd.DataFrame) -> Signal | None:
        if len(df) < 60:
            return None
        e20 = ema(df["close"], 20).iloc[-1]
        e50 = ema(df["close"], 50).iloc[-1]
        st_dir = int(supertrend(df["high"], df["low"], df["close"])["direction"].iloc[-1])

        if opp.direction is Side.BUY and e20 > e50 and st_dir == 1:
            return self._make_signal(opp, df, Side.BUY, "MCX uptrend (EMA20>EMA50, ST up)")
        if opp.direction is Side.SELL and e20 < e50 and st_dir == -1:
            return self._make_signal(opp, df, Side.SELL, "MCX downtrend (EMA20<EMA50, ST down)")
        return None
