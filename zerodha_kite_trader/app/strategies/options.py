"""Options strategy: directional CE/PE buying and ATM momentum.

This strategy reads a directional signal on the *underlying* and translates it
into buying the appropriate ATM option (CE for bullish, PE for bearish). The
actual option instrument is resolved by :mod:`app.strategies.options_chain`
at execution time; here we encode the intent and risk on the option premium.
"""
from __future__ import annotations

import pandas as pd

from app.domain import (
    Opportunity,
    ProductType,
    Side,
    Signal,
    SignalType,
    TradingType,
)
from app.indicators import rsi, supertrend
from app.strategies.base import Strategy


class OptionsStrategy(Strategy):
    name = "options_directional"
    default_product = ProductType.NRML
    default_trading_type = TradingType.INTRADAY
    # Option premiums are leveraged & decay; use a wider stop, quicker target.
    atr_stop_mult = 1.5
    atr_target_mult = 2.5

    def applies_to(self, opp: Opportunity) -> bool:
        # Act on strong momentum / trend on index or liquid stock underlyings.
        return opp.signal_type in (
            SignalType.MOMENTUM,
            SignalType.TREND_CONTINUATION,
            SignalType.BREAKOUT,
        )

    def build_signal(self, opp: Opportunity, df: pd.DataFrame) -> Signal | None:
        if len(df) < 30:
            return None
        r = float(rsi(df["close"]).iloc[-1])
        st_dir = int(supertrend(df["high"], df["low"], df["close"])["direction"].iloc[-1])

        # We always BUY the option (CE or PE); option_type encodes the view.
        option_type = None
        if opp.direction is Side.BUY and r >= 55 and st_dir == 1:
            option_type = "CE"
        elif opp.direction is Side.SELL and r <= 45 and st_dir == -1:
            option_type = "PE"
        if option_type is None:
            return None

        sig = self._make_signal(opp, df, Side.BUY,
                                f"ATM {option_type} buy on {opp.direction.value} momentum")
        sig.meta["option_type"] = option_type
        sig.meta["underlying"] = opp.instrument.tradingsymbol
        sig.meta["underlying_direction"] = opp.direction.value
        return sig
