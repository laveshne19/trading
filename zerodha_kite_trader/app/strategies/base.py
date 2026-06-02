"""Strategy base class.

A strategy consumes a scored :class:`Opportunity` plus its candle DataFrame and
either produces a fully-specified :class:`Signal` (entry, stop, target, product,
trading type) or ``None`` if its own entry conditions aren't met. ATR-based
stop/target helpers live here so every strategy sizes risk consistently.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

import pandas as pd

from app.domain import (
    Opportunity,
    ProductType,
    Side,
    Signal,
    TradingType,
)
from app.indicators import atr
from app.logging_config import get_logger

logger = get_logger(__name__)


class Strategy(ABC):
    """Abstract trading strategy."""

    name: str = "base"
    segments: tuple = ()                       # informational
    default_product: ProductType = ProductType.MIS
    default_trading_type: TradingType = TradingType.INTRADAY
    atr_stop_mult: float = 1.5
    atr_target_mult: float = 3.0               # 2:1 reward:risk by default

    @abstractmethod
    def applies_to(self, opp: Opportunity) -> bool:
        """Whether this strategy wants to act on the given opportunity."""

    @abstractmethod
    def build_signal(self, opp: Opportunity, df: pd.DataFrame) -> Signal | None:
        """Produce a Signal or None."""

    # --- shared helpers --------------------------------------------------
    def _atr(self, df: pd.DataFrame, period: int = 14) -> float:
        a = atr(df["high"], df["low"], df["close"], period)
        val = float(a.iloc[-1]) if len(a) else 0.0
        if val <= 0:
            # fallback: 1% of price
            val = float(df["close"].iloc[-1]) * 0.01
        return val

    def _stop_and_target(
        self, entry: float, side: Side, atr_value: float
    ) -> tuple[float, float]:
        risk = atr_value * self.atr_stop_mult
        reward = atr_value * self.atr_target_mult
        if side is Side.BUY:
            return round(entry - risk, 2), round(entry + reward, 2)
        return round(entry + risk, 2), round(entry - reward, 2)

    def _make_signal(
        self,
        opp: Opportunity,
        df: pd.DataFrame,
        side: Side,
        rationale: str,
    ) -> Signal:
        entry = float(df["close"].iloc[-1])
        atr_value = self._atr(df)
        stop, target = self._stop_and_target(entry, side, atr_value)
        return Signal(
            instrument=opp.instrument,
            strategy=self.name,
            side=side,
            entry_price=entry,
            stop_loss=stop,
            target=target,
            product=self.default_product,
            trading_type=self.default_trading_type,
            opportunity_score=opp.score,
            rationale=rationale,
            meta={"signal_type": opp.signal_type.value, "atr": atr_value},
        )
