"""Market-data service: candle retrieval with a short-lived cache.

Sits between strategies/scanner and the broker so we don't hammer the API for
the same candles repeatedly within a scan cycle.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

import pandas as pd

from app.broker.base import BrokerInterface
from app.data.instruments import candles_to_df
from app.domain import Instrument, Quote
from app.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class _CacheEntry:
    df: pd.DataFrame
    fetched_at: float


class MarketDataService:
    """Caches historical candles and live quotes for a short TTL."""

    def __init__(self, broker: BrokerInterface, candle_ttl: float = 30.0,
                 quote_ttl: float = 1.0) -> None:
        self._broker = broker
        self._candle_ttl = candle_ttl
        self._quote_ttl = quote_ttl
        self._candle_cache: dict[tuple[int, str, int], _CacheEntry] = {}
        self._quote_cache: dict[int, tuple[Quote, float]] = {}

    def get_candles(
        self, instrument: Instrument, interval: str = "minute", days: int = 5
    ) -> pd.DataFrame:
        key = (instrument.instrument_token, interval, days)
        now = time.monotonic()
        entry = self._candle_cache.get(key)
        if entry and now - entry.fetched_at < self._candle_ttl:
            return entry.df
        try:
            candles = self._broker.get_historical(instrument, interval, days)
        except Exception as exc:
            logger.warning("historical fetch failed for %s: %s",
                           instrument.tradingsymbol, exc)
            return entry.df if entry else candles_to_df([])
        df = candles_to_df(candles)
        self._candle_cache[key] = _CacheEntry(df, now)
        return df

    def get_quote(self, instrument: Instrument) -> Quote:
        now = time.monotonic()
        cached = self._quote_cache.get(instrument.instrument_token)
        if cached and now - cached[1] < self._quote_ttl:
            return cached[0]
        quote = self._broker.get_quote(instrument)
        self._quote_cache[instrument.instrument_token] = (quote, now)
        return quote

    def invalidate(self) -> None:
        self._candle_cache.clear()
        self._quote_cache.clear()
