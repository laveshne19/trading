"""Tests for the opportunity scoring engine."""
from __future__ import annotations

from app.data.instruments import make_equity_instrument
from app.domain import Opportunity, Side, SignalType
from app.scoring import OpportunityScorer


def _opp(direction: Side, features: dict) -> Opportunity:
    return Opportunity(
        instrument=make_equity_instrument("TEST"),
        signal_type=SignalType.MOMENTUM,
        direction=direction,
        reference_price=100.0,
        features=features,
    )


def test_score_in_range():
    scorer = OpportunityScorer()
    opp = _opp(Side.BUY, {"rsi": 65, "rvol": 2.0, "ema_alignment": 1,
                          "supertrend_dir": 1, "pattern_strength": 0.8,
                          "macd_hist": 0.5, "market_breadth": 0.7,
                          "trend_strength": 0.6, "vwap_dist": 0.5, "atr_pct": 1.0})
    score = scorer.score(opp)
    assert 0 <= score <= 100


def test_strong_bullish_scores_higher_than_weak():
    scorer = OpportunityScorer()
    strong = _opp(Side.BUY, {"rsi": 70, "rvol": 3.0, "ema_alignment": 1,
                             "supertrend_dir": 1, "pattern_strength": 1.0,
                             "macd_hist": 1.0, "market_breadth": 0.8,
                             "trend_strength": 0.9, "vwap_dist": 1.0, "atr_pct": 1.0})
    weak = _opp(Side.BUY, {"rsi": 52, "rvol": 1.0, "ema_alignment": 0,
                           "supertrend_dir": -1, "pattern_strength": 0.1,
                           "macd_hist": -0.2, "market_breadth": 0.4,
                           "trend_strength": 0.1, "vwap_dist": -0.5, "atr_pct": 3.0})
    assert scorer.score(strong) > scorer.score(weak)


def test_direction_symmetry():
    scorer = OpportunityScorer()
    bull = _opp(Side.BUY, {"rsi": 70, "supertrend_dir": 1, "ema_alignment": 1,
                           "macd_hist": 1.0, "pattern_strength": 0.9,
                           "market_breadth": 0.8, "trend_strength": 0.8})
    bear = _opp(Side.SELL, {"rsi": 30, "supertrend_dir": -1, "ema_alignment": -1,
                            "macd_hist": -1.0, "pattern_strength": 0.9,
                            "market_breadth": 0.2, "trend_strength": 0.8})
    # Mirror-image setups should score comparably.
    assert abs(scorer.score(bull) - scorer.score(bear)) < 15


def test_score_all_sorts_descending():
    scorer = OpportunityScorer()
    opps = [
        _opp(Side.BUY, {"pattern_strength": 0.2, "rsi": 55}),
        _opp(Side.BUY, {"pattern_strength": 0.9, "rsi": 70, "supertrend_dir": 1,
                        "ema_alignment": 1, "macd_hist": 1.0}),
    ]
    ranked = scorer.score_all(opps)
    assert ranked[0].score >= ranked[1].score
