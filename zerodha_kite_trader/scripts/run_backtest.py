"""Run a backtest for one or more symbols.

Usage:
    python scripts/run_backtest.py RELIANCE INFY --interval day --days 365

In paper mode (no Kite), candles are synthesised so you can see the engine and
metrics working; for real results, run with valid Kite credentials so the
backtester pulls genuine historical data.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.broker import get_broker
from app.backtest import BacktestEngine
from app.data.instruments import InstrumentUniverse, candles_to_df
from app.logging_config import setup_logging


def main() -> None:
    parser = argparse.ArgumentParser(description="Backtest the trading pipeline")
    parser.add_argument("symbols", nargs="+", help="NSE symbols, e.g. RELIANCE INFY")
    parser.add_argument("--interval", default="day", help="candle interval")
    parser.add_argument("--days", type=int, default=365, help="lookback days")
    parser.add_argument("--capital", type=float, default=None, help="starting capital")
    args = parser.parse_args()

    setup_logging("INFO")
    broker = get_broker()
    broker.connect()
    universe = InstrumentUniverse()
    if broker.name == "kite":
        universe.load_from_kite(broker)

    engine = BacktestEngine(starting_capital=args.capital)
    aggregate = {}
    for symbol in args.symbols:
        instrument = universe.get(symbol)
        candles = broker.get_historical(instrument, args.interval, args.days)
        df = candles_to_df(candles)
        result = engine.run(instrument, df)
        aggregate[symbol] = result.summary()
        print(f"\n=== {symbol} ===")
        print(json.dumps(result.summary(), indent=2))

    print("\n=== Aggregate ===")
    print(json.dumps(aggregate, indent=2))


if __name__ == "__main__":
    main()
