"""Tests for the strategy library and dispatcher."""
from __future__ import annotations

from app.data.instruments import make_equity_instrument
from app.domain import Opportunity, Side, SignalType
from app.strategies import (
    BreakoutStrategy,
    MeanReversionStrategy,
    TrendFollowingStrategy,
    build_default_strategies,
)
from app.strategies.registry import StrategyDispatcher


def _opp(signal_type: SignalType, direction: Side) -> Opportunity:
    return Opportunity(
        instrument=make_equity_instrument("TEST"),
        signal_type=signal_type,
        direction=direction,
        reference_price=100.0,
        features={},
    )


def test_trend_following_generates_long_in_uptrend(uptrend_df):
    strat = TrendFollowingStrategy()
    opp = _opp(SignalType.TREND_CONTINUATION, Side.BUY)
    sig = strat.build_signal(opp, uptrend_df)
    assert sig is not None
    assert sig.side is Side.BUY
    assert sig.stop_loss < sig.entry_price < sig.target
    assert sig.reward_risk_ratio > 1.0


def test_trend_following_no_signal_against_trend(uptrend_df):
    strat = TrendFollowingStrategy()
    opp = _opp(SignalType.TREND_CONTINUATION, Side.SELL)
    assert strat.build_signal(opp, uptrend_df) is None


def test_breakout_strategy_long(breakout_df):
    strat = BreakoutStrategy(opening_range_bars=10, min_rvol=1.2)
    opp = _opp(SignalType.BREAKOUT, Side.BUY)
    sig = strat.build_signal(opp, breakout_df)
    assert sig is not None
    assert sig.side is Side.BUY


def test_mean_reversion_applies_only_to_reversal():
    strat = MeanReversionStrategy()
    assert strat.applies_to(_opp(SignalType.REVERSAL, Side.BUY))
    assert not strat.applies_to(_opp(SignalType.BREAKOUT, Side.BUY))


def test_dispatcher_returns_signal(uptrend_df):
    dispatcher = StrategyDispatcher(build_default_strategies())
    opp = _opp(SignalType.TREND_CONTINUATION, Side.BUY)
    opp.score = 90.0
    sig = dispatcher.dispatch(opp, uptrend_df)
    assert sig is not None
    assert sig.reward_risk_ratio > 0


def test_stop_target_orientation_for_short(downtrend_df):
    strat = TrendFollowingStrategy()
    opp = _opp(SignalType.TREND_CONTINUATION, Side.SELL)
    sig = strat.build_signal(opp, downtrend_df)
    assert sig is not None
    assert sig.stop_loss > sig.entry_price > sig.target
