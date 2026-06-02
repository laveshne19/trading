"""Event-driven backtesting engine.

Replays historical candles bar-by-bar through the *same* scanner → scorer →
strategy → risk → sizing pipeline used live, simulating fills with slippage and
charging realistic costs. Works for NSE equities, options (on premium series)
and MCX, given a candle DataFrame per instrument.

This is intentionally a single-position-per-instrument, next-bar-open fill model
— simple, conservative and honest. It is not a tick-level simulator.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from app.backtest.metrics import Metrics, compute_metrics
from app.config import settings
from app.domain import Instrument, Opportunity, Side, SignalType
from app.indicators import atr
from app.logging_config import get_logger
from app.risk.charges import round_trip_charges
from app.scanner.patterns import ALL_DETECTORS
from app.scoring import OpportunityScorer
from app.strategies.registry import StrategyDispatcher

logger = get_logger(__name__)


@dataclass
class BacktestTrade:
    symbol: str
    side: str
    entry_time: pd.Timestamp
    entry: float
    exit_time: pd.Timestamp
    exit: float
    quantity: int
    gross_pnl: float
    charges: float
    net_pnl: float
    reason: str


@dataclass
class BacktestResult:
    metrics: Metrics
    trades: list[BacktestTrade] = field(default_factory=list)
    equity_curve: list[float] = field(default_factory=list)

    def summary(self) -> dict:
        return {**self.metrics.as_dict(), "num_trades": len(self.trades)}


class BacktestEngine:
    """Replays history through the live decision pipeline."""

    def __init__(
        self,
        starting_capital: float | None = None,
        slippage_bps: float = 3.0,
        warmup: int = 60,
        risk_per_trade: float | None = None,
    ) -> None:
        self._capital = starting_capital or settings.initial_capital
        self._slippage = slippage_bps / 10_000.0
        self._warmup = warmup
        self._risk = risk_per_trade if risk_per_trade is not None else settings.risk_per_trade
        self._scorer = OpportunityScorer()
        self._dispatcher = StrategyDispatcher()
        self._min_score = settings.min_opportunity_score

    def run(self, instrument: Instrument, df: pd.DataFrame) -> BacktestResult:
        """Backtest a single instrument over its candle history."""
        if len(df) <= self._warmup + 2:
            return BacktestResult(compute_metrics([self._capital], []))

        equity = self._capital
        equity_curve: list[float] = [equity]
        trades: list[BacktestTrade] = []
        open_trade: dict | None = None

        for i in range(self._warmup, len(df) - 1):
            window = df.iloc[: i + 1]
            price = float(window["close"].iloc[-1])

            # --- manage an open position on this bar ---
            if open_trade is not None:
                high = float(df["high"].iloc[i])
                low = float(df["low"].iloc[i])
                side = open_trade["side"]
                exit_price = None
                reason = ""
                if side is Side.BUY:
                    if low <= open_trade["stop"]:
                        exit_price, reason = open_trade["stop"], "stop_loss"
                    elif high >= open_trade["target"]:
                        exit_price, reason = open_trade["target"], "target"
                else:
                    if high >= open_trade["stop"]:
                        exit_price, reason = open_trade["stop"], "stop_loss"
                    elif low <= open_trade["target"]:
                        exit_price, reason = open_trade["target"], "target"

                if exit_price is not None:
                    equity, trade = self._close(open_trade, instrument, exit_price,
                                                df.index[i], reason, equity)
                    trades.append(trade)
                    open_trade = None

            equity_curve.append(equity + self._mark(open_trade, price))

            # --- look for a new entry (only if flat) ---
            if open_trade is not None:
                continue
            signal = self._evaluate(instrument, window)
            if signal is None:
                continue
            # Fill at next bar open with slippage.
            next_open = float(df["open"].iloc[i + 1])
            fill = next_open * (1 + self._slippage) if signal.side is Side.BUY else next_open * (1 - self._slippage)
            risk_per_unit = abs(fill - signal.stop_loss)
            if risk_per_unit <= 0:
                continue
            qty = int((equity * self._risk) / risk_per_unit)
            qty = max(qty, 0)
            lot = max(instrument.lot_size, 1)
            qty = (qty // lot) * lot
            if qty <= 0:
                continue
            open_trade = {
                "side": signal.side,
                "entry": fill,
                "entry_time": df.index[i + 1],
                "stop": signal.stop_loss,
                "target": signal.target,
                "qty": qty,
            }

        # Close any residual position at the last close.
        if open_trade is not None:
            equity, trade = self._close(open_trade, instrument,
                                        float(df["close"].iloc[-1]), df.index[-1],
                                        "eod", equity)
            trades.append(trade)
            equity_curve.append(equity)

        metrics = compute_metrics(equity_curve, [t.net_pnl for t in trades], days=len(df))
        return BacktestResult(metrics=metrics, trades=trades, equity_curve=equity_curve)

    # --- helpers ---------------------------------------------------------
    def _evaluate(self, instrument: Instrument, window: pd.DataFrame):
        """Run detectors → score → strategy, return a signal or None."""
        best = None
        best_score = -1.0
        feats = _quick_features(window)
        for name, detector in ALL_DETECTORS.items():
            try:
                detected, direction, strength = detector(window)
            except Exception:
                continue
            if not detected or direction is None:
                continue
            opp = Opportunity(
                instrument=instrument,
                signal_type=SignalType(name),
                direction=direction,
                reference_price=float(window["close"].iloc[-1]),
                features={**feats, "pattern_strength": strength},
            )
            self._scorer.score(opp)
            if opp.score > best_score:
                best_score = opp.score
                best = opp
        if best is None or best.score < self._min_score:
            return None
        return self._dispatcher.dispatch(best, window)

    def _mark(self, open_trade: dict | None, price: float) -> float:
        if open_trade is None:
            return 0.0
        side = open_trade["side"]
        return (price - open_trade["entry"]) * side.sign * open_trade["qty"]

    def _close(self, open_trade, instrument, exit_price, exit_time, reason, equity):  # noqa: ANN001
        side = open_trade["side"]
        qty = open_trade["qty"]
        gross = (exit_price - open_trade["entry"]) * side.sign * qty
        charges = round_trip_charges(
            instrument.segment, settings_product(instrument),
            open_trade["entry"], exit_price, qty
        )
        net = gross - charges
        equity += net
        trade = BacktestTrade(
            symbol=instrument.tradingsymbol,
            side=side.value,
            entry_time=open_trade["entry_time"],
            entry=round(open_trade["entry"], 2),
            exit_time=exit_time,
            exit=round(exit_price, 2),
            quantity=qty,
            gross_pnl=round(gross, 2),
            charges=round(charges, 2),
            net_pnl=round(net, 2),
            reason=reason,
        )
        return equity, trade


def _quick_features(window: pd.DataFrame) -> dict[str, float]:
    from app.indicators import macd, relative_volume, rsi, supertrend
    from app.indicators.technical import ema_alignment

    close = window["close"]
    out: dict[str, float] = {}
    try:
        out["rsi"] = float(rsi(close).iloc[-1])
        out["macd_hist"] = float(macd(close)["hist"].iloc[-1])
        a = atr(window["high"], window["low"], close)
        out["atr_pct"] = float(a.iloc[-1]) / close.iloc[-1] * 100 if close.iloc[-1] else 0.0
        out["rvol"] = float(relative_volume(window["volume"]).iloc[-1])
        out["supertrend_dir"] = float(supertrend(window["high"], window["low"], close)["direction"].iloc[-1])
        out["ema_alignment"] = float(ema_alignment(close))
        out["trend_strength"] = min(1.0, abs(out["ema_alignment"]) * 0.5)
        out["market_breadth"] = 0.5
        out["vwap_dist"] = 0.0
        out["pcr"] = 1.0
        out["oi_change"] = 0.0
    except Exception:
        pass
    # sanitise NaNs
    return {k: (v if v == v else 0.0) for k, v in out.items()}


def settings_product(instrument: Instrument):
    from app.domain import ProductType

    return ProductType.MIS if not instrument.is_derivative else ProductType.NRML
