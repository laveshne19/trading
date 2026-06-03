"""Feature engineering for the ML trade-quality model.

The model and the scorer share the same raw indicator vector, but the ML layer
consumes a fixed, ordered feature list so the trained model and inference stay
consistent. Direction is folded in as ``direction_sign`` so one model handles
both long and short setups.
"""
from __future__ import annotations

from app.domain import Opportunity, Side, Signal

# Fixed feature order — DO NOT reorder without retraining.
FEATURE_NAMES: list[str] = [
    "opportunity_score",
    "trend_strength",
    "rvol",
    "atr_pct",
    "rsi",
    "macd_hist",
    "supertrend_dir",
    "ema_alignment",
    "vwap_dist",
    "market_breadth",
    "pcr",
    "oi_change",
    "pattern_strength",
    "direction_sign",
]


def _vec(features: dict, direction: Side, score: float) -> list[float]:
    f = features
    return [
        float(score),
        float(f.get("trend_strength", 0.0)),
        float(f.get("rvol", 1.0)),
        float(f.get("atr_pct", 0.0)),
        float(f.get("rsi", 50.0)),
        float(f.get("macd_hist", 0.0)),
        float(f.get("supertrend_dir", 0.0)),
        float(f.get("ema_alignment", 0.0)),
        float(f.get("vwap_dist", 0.0)),
        float(f.get("market_breadth", 0.5)),
        float(f.get("pcr", 1.0)),
        float(f.get("oi_change", 0.0)),
        float(f.get("pattern_strength", 0.0)),
        1.0 if direction is Side.BUY else -1.0,
    ]


def features_from_opportunity(opp: Opportunity) -> list[float]:
    return _vec(opp.features, opp.direction, opp.score)


def features_from_signal(signal: Signal) -> list[float]:
    return _vec(signal.meta, signal.side, signal.opportunity_score)
