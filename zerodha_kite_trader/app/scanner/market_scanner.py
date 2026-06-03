"""Market scanner.

Sweeps the configured universe (equities, indices and MCX) across all pattern
detectors and emits :class:`Opportunity` objects with raw feature vectors for
the scoring engine to grade.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.data.instruments import InstrumentUniverse
from app.data.market_data import MarketDataService
from app.domain import Instrument, Opportunity, SignalType
from app.indicators import (
    atr,
    ema,
    macd,
    relative_volume,
    rsi,
    supertrend,
    vwap,
)
from app.indicators.technical import ema_alignment
from app.logging_config import get_logger
from app.scanner.patterns import ALL_DETECTORS

logger = get_logger(__name__)


class MarketScanner:
    """Continuously scans instruments for tradable opportunities."""

    def __init__(self, market_data: MarketDataService, universe: InstrumentUniverse) -> None:
        self._md = market_data
        self._universe = universe
        self._market_breadth: float = 0.5  # fraction of universe advancing

    # --- breadth ---------------------------------------------------------
    def compute_market_breadth(self, instruments: list[Instrument]) -> float:
        """Fraction of instruments trading above their 20-EMA (0..1)."""
        advancing = 0
        total = 0
        for inst in instruments:
            df = self._md.get_candles(inst, "day", days=60)
            if len(df) < 21:
                continue
            total += 1
            if df["close"].iloc[-1] > ema(df["close"], 20).iloc[-1]:
                advancing += 1
        self._market_breadth = advancing / total if total else 0.5
        return self._market_breadth

    @property
    def market_breadth(self) -> float:
        return self._market_breadth

    # --- feature extraction ---------------------------------------------
    def _features(self, df: pd.DataFrame) -> dict[str, float]:
        """Compute the indicator feature vector used by scorer + ML."""
        close = df["close"]
        feats: dict[str, float] = {}

        def last(x: pd.Series, default: float = 0.0) -> float:
            v = x.iloc[-1] if len(x) else default
            return float(v) if np.isfinite(v) else default

        feats["rsi"] = last(rsi(close))
        macd_df = macd(close)
        feats["macd"] = last(macd_df["macd"])
        feats["macd_hist"] = last(macd_df["hist"])
        feats["atr"] = last(atr(df["high"], df["low"], close))
        feats["atr_pct"] = feats["atr"] / close.iloc[-1] * 100 if close.iloc[-1] else 0.0
        feats["rvol"] = last(relative_volume(df["volume"]), 1.0)
        st = supertrend(df["high"], df["low"], close)
        feats["supertrend_dir"] = last(st["direction"])
        feats["ema_alignment"] = float(ema_alignment(close))
        try:
            feats["vwap_dist"] = (close.iloc[-1] - vwap(df).iloc[-1]) / close.iloc[-1] * 100
        except Exception:
            feats["vwap_dist"] = 0.0
        feats["trend_strength"] = self._trend_strength(close)
        feats["market_breadth"] = self._market_breadth
        # OI / PCR are populated for derivatives by the options helper; default neutral.
        feats.setdefault("oi_change", 0.0)
        feats.setdefault("pcr", 1.0)
        return feats

    @staticmethod
    def _trend_strength(close: pd.Series) -> float:
        """0..1 measure: distance of price from EMA200 normalised by ATR-ish scale."""
        if len(close) < 50:
            return 0.0
        e = ema(close, min(200, len(close) - 1)).iloc[-1]
        if not np.isfinite(e) or e == 0:
            return 0.0
        dist = abs(close.iloc[-1] - e) / e
        return float(max(0.0, min(1.0, dist * 10)))

    # --- main scan -------------------------------------------------------
    def scan(self, instruments: list[Instrument] | None = None,
             interval: str = "minute", days: int = 5) -> list[Opportunity]:
        """Scan instruments and return raw (unscored beyond strength) opportunities."""
        targets = instruments or self._universe.equity_watchlist()
        opportunities: list[Opportunity] = []

        for inst in targets:
            df = self._md.get_candles(inst, interval, days)
            if len(df) < 30:
                continue
            features = self._features(df)
            ref_price = float(df["close"].iloc[-1])

            for name, detector in ALL_DETECTORS.items():
                try:
                    detected, direction, strength = detector(df)
                except Exception:
                    logger.debug("detector %s failed for %s", name, inst.tradingsymbol)
                    continue
                if not detected or direction is None:
                    continue
                opportunities.append(
                    Opportunity(
                        instrument=inst,
                        signal_type=SignalType(name),
                        direction=direction,
                        reference_price=ref_price,
                        features={**features, "pattern_strength": strength},
                        notes=f"{name} strength={strength:.2f}",
                    )
                )

        logger.info("Scan complete: %d opportunities across %d instruments",
                    len(opportunities), len(targets))
        return opportunities
