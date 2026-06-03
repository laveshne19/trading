"""Mean-reversion strategy: RSI extremes + Bollinger Band touches."""
from __future__ import annotations

import pandas as pd

from app.domain import Opportunity, ProductType, Side, Signal, SignalType, TradingType
from app.indicators import bollinger_bands, rsi
from app.strategies.base import Strategy


class MeanReversionStrategy(Strategy):
    name = "mean_reversion"
    default_product = ProductType.MIS
    default_trading_type = TradingType.INTRADAY
    # Mean reversion: tighter target, since we fade extremes back to the mean.
    atr_stop_mult = 1.5
    atr_target_mult = 2.0

    def __init__(self, rsi_low: float = 30.0, rsi_high: float = 70.0) -> None:
        self._rsi_low = rsi_low
        self._rsi_high = rsi_high

    def applies_to(self, opp: Opportunity) -> bool:
        return opp.signal_type is SignalType.REVERSAL

    def build_signal(self, opp: Opportunity, df: pd.DataFrame) -> Signal | None:
        if len(df) < 30:
            return None
        r = float(rsi(df["close"]).iloc[-1])
        bb = bollinger_bands(df["close"])
        close = float(df["close"].iloc[-1])
        lower = float(bb["lower"].iloc[-1])
        upper = float(bb["upper"].iloc[-1])
        middle = float(bb["middle"].iloc[-1])

        if opp.direction is Side.BUY and r <= self._rsi_low and close <= lower:
            sig = self._make_signal(opp, df, Side.BUY,
                                    f"Oversold RSI={r:.0f}, below lower BB")
            sig.target = round(middle, 2)  # revert to mean
            return sig
        if opp.direction is Side.SELL and r >= self._rsi_high and close >= upper:
            sig = self._make_signal(opp, df, Side.SELL,
                                    f"Overbought RSI={r:.0f}, above upper BB")
            sig.target = round(middle, 2)
            return sig
        return None
