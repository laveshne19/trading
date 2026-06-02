"""Opportunity scoring engine.

Converts a feature vector into a transparent, weighted 0–100 score. Each
component returns a 0..1 sub-score aligned with the opportunity's *direction*
(so a bullish setup is rewarded for bullish readings and vice-versa). The
weighting is explicit and configurable — no black box at this stage; the ML
layer adds a separate probabilistic filter on top.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.domain import Opportunity, Side
from app.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class ScoreWeights:
    """Relative weights of each scoring component. Need not sum to 1; the
    engine normalises by the total weight applied."""

    trend_strength: float = 1.5
    relative_volume: float = 1.2
    open_interest: float = 0.8
    pcr: float = 0.6
    vwap: float = 1.0
    atr: float = 0.6
    rsi: float = 1.0
    macd: float = 1.0
    supertrend: float = 1.2
    ema_alignment: float = 1.3
    market_breadth: float = 0.8
    pattern_strength: float = 1.5

    def as_dict(self) -> dict[str, float]:
        return {
            "trend_strength": self.trend_strength,
            "relative_volume": self.relative_volume,
            "open_interest": self.open_interest,
            "pcr": self.pcr,
            "vwap": self.vwap,
            "atr": self.atr,
            "rsi": self.rsi,
            "macd": self.macd,
            "supertrend": self.supertrend,
            "ema_alignment": self.ema_alignment,
            "market_breadth": self.market_breadth,
            "pattern_strength": self.pattern_strength,
        }


def _clip01(x: float) -> float:
    return max(0.0, min(1.0, x))


class OpportunityScorer:
    """Grades opportunities 0–100 from their feature vectors."""

    def __init__(self, weights: ScoreWeights | None = None) -> None:
        self._w = weights or ScoreWeights()

    def score(self, opp: Opportunity) -> float:
        f = opp.features
        bullish = opp.direction is Side.BUY
        sign = 1.0 if bullish else -1.0
        components: dict[str, float] = {}

        # Trend strength: stronger trend, better — but only if aligned.
        aligned = (f.get("ema_alignment", 0.0) * sign) >= 0
        components["trend_strength"] = _clip01(f.get("trend_strength", 0.0)) * (1.0 if aligned else 0.3)

        # Relative volume: >1 is good; cap contribution at rvol=3.
        components["relative_volume"] = _clip01((f.get("rvol", 1.0) - 1.0) / 2.0)

        # Open interest change in trade direction (derivatives only).
        components["open_interest"] = _clip01(0.5 + sign * f.get("oi_change", 0.0) / 10.0)

        # PCR: for bullish, lower PCR (<1) is supportive; for bearish, higher.
        pcr = f.get("pcr", 1.0)
        components["pcr"] = _clip01(0.5 + sign * (1.0 - pcr))

        # VWAP distance: bullish above VWAP, bearish below.
        components["vwap"] = _clip01(0.5 + sign * f.get("vwap_dist", 0.0) / 2.0)

        # ATR%: moderate volatility rewarded (need movement, not chaos).
        atr_pct = f.get("atr_pct", 0.0)
        components["atr"] = _clip01(1.0 - abs(atr_pct - 1.0) / 2.0)

        # RSI: bullish wants 50–75, bearish wants 25–50.
        rsi_v = f.get("rsi", 50.0)
        components["rsi"] = _clip01((rsi_v - 50.0) / 25.0) if bullish else _clip01((50.0 - rsi_v) / 25.0)

        # MACD histogram sign agreement.
        components["macd"] = _clip01(0.5 + sign * f.get("macd_hist", 0.0))

        # Supertrend direction agreement.
        components["supertrend"] = 1.0 if (f.get("supertrend_dir", 0.0) * sign) > 0 else 0.0

        # EMA stack alignment.
        components["ema_alignment"] = 1.0 if aligned and f.get("ema_alignment", 0.0) != 0 else (
            0.5 if f.get("ema_alignment", 0.0) == 0 else 0.0
        )

        # Market breadth: bullish wants breadth>0.5, bearish wants <0.5.
        breadth = f.get("market_breadth", 0.5)
        components["market_breadth"] = _clip01(0.5 + sign * (breadth - 0.5) * 2)

        # The pattern's own strength.
        components["pattern_strength"] = _clip01(f.get("pattern_strength", 0.0))

        weights = self._w.as_dict()
        total_w = sum(weights.values())
        weighted = sum(components[k] * weights[k] for k in components)
        score = (weighted / total_w) * 100.0 if total_w else 0.0
        opp.score = round(score, 2)
        opp.features["score_components"] = components  # type: ignore[assignment]
        return opp.score

    def score_all(self, opportunities: list[Opportunity]) -> list[Opportunity]:
        for opp in opportunities:
            self.score(opp)
        opportunities.sort(key=lambda o: o.score, reverse=True)
        return opportunities
