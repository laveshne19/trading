"""Strategy registry and dispatcher.

The dispatcher picks the best-fitting strategy for each scored opportunity and
asks it for a signal. Multiple strategies may apply; we take the first that
produces a signal, in priority order.
"""
from __future__ import annotations

import pandas as pd

from app.domain import Opportunity, Signal
from app.logging_config import get_logger
from app.strategies.base import Strategy
from app.strategies.breakout import BreakoutStrategy
from app.strategies.mcx import MCXStrategy
from app.strategies.mean_reversion import MeanReversionStrategy
from app.strategies.options import OptionsStrategy
from app.strategies.trend_following import TrendFollowingStrategy

logger = get_logger(__name__)


def build_default_strategies() -> list[Strategy]:
    """Default strategy set in dispatch-priority order."""
    return [
        MCXStrategy(),
        TrendFollowingStrategy(),
        BreakoutStrategy(),
        OptionsStrategy(),
        MeanReversionStrategy(),
    ]


class StrategyDispatcher:
    """Routes opportunities to strategies and collects signals."""

    def __init__(self, strategies: list[Strategy] | None = None) -> None:
        self._strategies = strategies or build_default_strategies()

    @property
    def strategies(self) -> list[Strategy]:
        return self._strategies

    def dispatch(self, opp: Opportunity, df: pd.DataFrame) -> Signal | None:
        for strat in self._strategies:
            if not strat.applies_to(opp):
                continue
            try:
                signal = strat.build_signal(opp, df)
            except Exception:
                logger.exception("strategy %s failed on %s", strat.name,
                                 opp.instrument.tradingsymbol)
                continue
            if signal is not None and signal.reward_risk_ratio > 0:
                return signal
        return None
