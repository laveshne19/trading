"""Orchestrator — the automated trading loop.

Wires every module together and runs the decision cycle:

    1. (periodically) refresh market breadth
    2. scan the universe for opportunities
    3. score them (0–100); keep score > MIN_OPPORTUNITY_SCORE
    4. build a strategy signal
    5. ML filter (probability ≥ ML_CONFIDENCE_THRESHOLD)
    6. risk gate (limits, RR, kill switch)
    7. position-size and execute (entry + protective stop)
    8. manage open positions (trailing stop, SL/target, square-off)
    9. publish live state for the dashboard; send Telegram alerts

Designed to run as a long-lived process (systemd / Docker). Start it in paper
mode first: ``BROKER=paper python -m app.main``.
"""
from __future__ import annotations

import signal
import time
from datetime import datetime

from app.broker import get_broker
from app.config import settings
from app.data.instruments import InstrumentUniverse
from app.data.market_data import MarketDataService
from app.db import repository
from app.db.init_db import init_db
from app.domain import Position, Signal
from app.execution import ExecutionEngine
from app.logging_config import audit, get_logger, setup_logging
from app.ml import features_from_signal, get_model
from app.notifications import get_notifier
from app.portfolio import PortfolioManager
from app.risk import PositionSizer, RiskManager
from app.scanner import MarketScanner
from app.scoring import OpportunityScorer
from app.state import publish_state, read_state
from app.strategies.registry import StrategyDispatcher
from app.utils import is_market_open, now_ist

logger = get_logger(__name__)


class TradingEngine:
    """Top-level orchestrator."""

    def __init__(self, cycle_seconds: float = 30.0) -> None:
        self._cycle = cycle_seconds
        self._running = False

        self.broker = get_broker()
        self.broker.connect()

        self.universe = InstrumentUniverse()
        if self.broker.name == "kite":
            self.universe.load_from_kite(self.broker)

        self.market_data = MarketDataService(self.broker)
        self.scanner = MarketScanner(self.market_data, self.universe)
        self.scorer = OpportunityScorer()
        self.dispatcher = StrategyDispatcher()
        self.model = get_model()
        self.risk = RiskManager(starting_equity=settings.initial_capital)
        self.sizer = PositionSizer()
        self.execution = ExecutionEngine(self.broker)
        self.notifier = get_notifier()
        self.portfolio = PortfolioManager(
            self.execution, self.risk, on_exit=self._on_exit
        )

        self._last_breadth_refresh = 0.0
        self._daily_summary_sent_for: str | None = None

    # --- callbacks -------------------------------------------------------
    def _on_exit(self, position: Position, net_pnl: float, reason: str) -> None:
        if reason == "stop_loss":
            self.notifier.stop_loss(position, net_pnl)
        elif reason == "target":
            self.notifier.target_hit(position, net_pnl)
        else:
            self.notifier.exit(position, net_pnl, reason)

    # --- lifecycle -------------------------------------------------------
    def start(self) -> None:
        setup_logging(settings.log_level)
        init_db()
        self._running = True
        self._install_signal_handlers()
        logger.info("Trading engine starting (broker=%s, dry_run=%s, capital=₹%.0f)",
                    self.broker.name, settings.dry_run, settings.initial_capital)
        audit("ENGINE START")
        self._loop()

    def stop(self) -> None:
        self._running = False

    def _install_signal_handlers(self) -> None:
        def handler(signum, frame):  # noqa: ANN001
            logger.warning("Signal %s received; shutting down gracefully.", signum)
            self._running = False
        signal.signal(signal.SIGINT, handler)
        signal.signal(signal.SIGTERM, handler)

    # --- the loop --------------------------------------------------------
    def _loop(self) -> None:
        while self._running:
            cycle_start = time.monotonic()
            try:
                self._tick()
            except Exception:
                logger.exception("Unhandled error in trading cycle")
            elapsed = time.monotonic() - cycle_start
            time.sleep(max(0.0, self._cycle - elapsed))

        # graceful shutdown
        logger.info("Closing all positions before exit…")
        self.portfolio.close_all(reason="shutdown")
        self._publish()
        audit("ENGINE STOP")

    def _tick(self) -> None:
        now = now_ist()

        # External kill-switch request from the dashboard.
        if read_state().get("kill_switch_requested"):
            self.risk.engage_kill_switch("dashboard request")

        # Always manage existing positions, even outside entry windows.
        self._manage_positions(now)

        if not is_market_open(now):
            self._maybe_daily_summary(now)
            self._publish()
            return

        if self.risk.kill_switch_active:
            self._publish()
            return

        # Intraday square-off.
        self.portfolio.square_off_intraday(now)

        # Look for new entries only if we have capacity.
        if self.portfolio.has_capacity:
            self._scan_and_trade()

        self._publish()

    # --- entry pipeline --------------------------------------------------
    def _scan_and_trade(self) -> None:
        watchlist = self.universe.equity_watchlist()

        # Refresh market breadth ~ every 5 minutes.
        if time.monotonic() - self._last_breadth_refresh > 300:
            self.scanner.compute_market_breadth(watchlist[:25])
            self._last_breadth_refresh = time.monotonic()

        opportunities = self.scanner.scan(watchlist)
        opportunities = self.scorer.score_all(opportunities)

        for opp in opportunities:
            if not self.portfolio.has_capacity:
                break
            if opp.score < settings.min_opportunity_score:
                break  # list is sorted desc; nothing better follows
            if self.portfolio.is_open(opp.instrument.instrument_token):
                continue

            df = self.market_data.get_candles(opp.instrument, "minute", days=5)
            signal = self.dispatcher.dispatch(opp, df)
            if signal is None:
                continue

            # ML filter.
            proba = self.model.predict_proba(features_from_signal(signal))
            signal.ml_confidence = round(proba, 4)
            signal.expected_return = round(
                self.model.expected_return(proba, signal.reward_risk_ratio), 4
            )
            signal_id = repository.save_signal(signal, acted_upon=False)

            if not self.model.passes_threshold(proba):
                logger.info("ML filtered %s (p=%.2f < %.2f)",
                            signal.instrument.tradingsymbol, proba,
                            settings.ml_confidence_threshold)
                continue

            decision = self.risk.evaluate(signal)
            if not decision.approved:
                logger.info("Risk vetoed %s: %s",
                            signal.instrument.tradingsymbol, decision.reason)
                continue

            self._execute(signal, signal_id)

    def _execute(self, signal: Signal, signal_id: int) -> None:
        equity = self.risk.equity
        margin = self.broker.get_available_margin()
        qty = self.sizer.size(signal, equity, margin)
        if qty <= 0:
            logger.info("Sizer returned 0 qty for %s; skipping",
                        signal.instrument.tradingsymbol)
            return

        position = self.execution.enter(signal, qty, signal_id)
        if position is None:
            return
        self.portfolio.add(position)
        self.notifier.entry(position)
        self.notifier.signal(signal)

    # --- position management --------------------------------------------
    def _manage_positions(self, now: datetime) -> None:
        for pos in list(self.portfolio.positions):
            try:
                quote = self.market_data.get_quote(pos.instrument)
                self.portfolio.update_price(pos.instrument.instrument_token, quote.last_price)
            except Exception:
                logger.debug("price update failed for %s", pos.instrument.tradingsymbol)

        # Mark-to-market equity for drawdown / kill switch.
        prices = {p.instrument.instrument_token: p.last_price for p in self.portfolio.positions}
        unrealized = self.portfolio.total_unrealized(prices)
        self.risk.update_equity(self.risk.equity + unrealized)

    # --- housekeeping ----------------------------------------------------
    def _maybe_daily_summary(self, now: datetime) -> None:
        key = now.strftime("%Y-%m-%d")
        if self._daily_summary_sent_for == key:
            return
        # Send shortly after equity close.
        if now.time() < settings.equity_end_t:
            return
        trades = repository.get_today_trades()
        closed = [t for t in trades if t.status == "CLOSED"]
        wins = sum(1 for t in closed if t.net_pnl > 0)
        stats = {
            **self.risk.snapshot(),
            "trades_count": len(closed),
            "win_rate": (wins / len(closed) * 100.0) if closed else 0.0,
        }
        repository.record_performance(stats)
        self.notifier.daily_summary(stats)
        self._daily_summary_sent_for = key
        logger.info("Daily summary sent: %s", stats)

    def _publish(self) -> None:
        prices = {p.instrument.instrument_token: p.last_price for p in self.portfolio.positions}
        snapshot = {
            "broker": self.broker.name,
            "dry_run": settings.dry_run,
            "kill_switch": self.risk.kill_switch_active,
            "risk": self.risk.snapshot(),
            "unrealized_pnl": round(self.portfolio.total_unrealized(prices), 2),
            "positions": [
                {
                    "symbol": p.instrument.tradingsymbol,
                    "side": p.side.value,
                    "qty": p.quantity,
                    "entry": round(p.entry_price, 2),
                    "ltp": round(p.last_price, 2),
                    "stop": round(p.stop_loss, 2),
                    "target": round(p.target, 2),
                    "pnl": round(p.unrealized_pnl(), 2),
                    "strategy": p.strategy,
                }
                for p in self.portfolio.positions
            ],
        }
        publish_state(snapshot)


def main() -> None:
    engine = TradingEngine()
    engine.start()


if __name__ == "__main__":
    main()
