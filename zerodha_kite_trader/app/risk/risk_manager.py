"""Risk management engine.

Enforces the hard limits before any order is allowed:

* risk per trade (via the position sizer),
* maximum concurrent open positions,
* maximum daily loss (halts new entries for the day),
* maximum peak-to-trough drawdown (engages the kill switch),
* a manual emergency kill switch.

The risk manager is the single gate every signal must pass through.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.config import settings
from app.domain import Signal
from app.logging_config import audit, get_logger

logger = get_logger(__name__)


@dataclass
class RiskDecision:
    approved: bool
    reason: str = ""


class RiskManager:
    """Tracks equity, P&L and limits; approves or vetoes trades."""

    def __init__(self, starting_equity: float | None = None) -> None:
        self._start_equity = starting_equity if starting_equity is not None else settings.initial_capital
        self._equity = self._start_equity
        self._peak_equity = self._start_equity
        self._realized_today = 0.0
        self._today = date.today()
        self._kill_switch = False
        self._open_positions = 0
        self._min_reward_risk = 1.2  # reject trades worse than this RR

    # --- state updates ---------------------------------------------------
    def _roll_day(self) -> None:
        today = date.today()
        if today != self._today:
            logger.info("New trading day; resetting daily P&L (was ₹%.2f)", self._realized_today)
            self._today = today
            self._realized_today = 0.0

    def on_position_opened(self) -> None:
        self._open_positions += 1

    def on_position_closed(self, realized_pnl: float) -> None:
        self._roll_day()
        self._open_positions = max(0, self._open_positions - 1)
        self._realized_today += realized_pnl
        self._equity += realized_pnl
        self._peak_equity = max(self._peak_equity, self._equity)
        if self.current_drawdown >= settings.max_drawdown:
            self.engage_kill_switch(f"max drawdown {self.current_drawdown:.1%} breached")

    def update_equity(self, equity: float) -> None:
        """Update mark-to-market equity (realized + unrealized) for drawdown."""
        self._equity = equity
        self._peak_equity = max(self._peak_equity, equity)
        if self.current_drawdown >= settings.max_drawdown:
            self.engage_kill_switch(f"max drawdown {self.current_drawdown:.1%} breached")

    # --- kill switch -----------------------------------------------------
    def engage_kill_switch(self, reason: str) -> None:
        if not self._kill_switch:
            self._kill_switch = True
            audit(f"KILL SWITCH ENGAGED: {reason}")
            logger.critical("KILL SWITCH ENGAGED: %s", reason)

    def reset_kill_switch(self) -> None:
        self._kill_switch = False
        logger.warning("Kill switch manually reset")

    @property
    def kill_switch_active(self) -> bool:
        return self._kill_switch

    # --- metrics ---------------------------------------------------------
    @property
    def equity(self) -> float:
        return self._equity

    @property
    def realized_today(self) -> float:
        self._roll_day()
        return self._realized_today

    @property
    def current_drawdown(self) -> float:
        if self._peak_equity <= 0:
            return 0.0
        return max(0.0, (self._peak_equity - self._equity) / self._peak_equity)

    @property
    def daily_loss_pct(self) -> float:
        return max(0.0, -self._realized_today / self._start_equity)

    @property
    def open_positions(self) -> int:
        return self._open_positions

    # --- the gate --------------------------------------------------------
    def evaluate(self, signal: Signal) -> RiskDecision:
        """Approve or reject a signal against all risk limits."""
        self._roll_day()

        if self._kill_switch:
            return RiskDecision(False, "kill switch active")

        if self._open_positions >= settings.max_open_positions:
            return RiskDecision(False, f"max open positions ({settings.max_open_positions}) reached")

        if self.daily_loss_pct >= settings.max_daily_loss:
            self.engage_kill_switch("daily loss limit reached")
            return RiskDecision(False, f"daily loss limit {settings.max_daily_loss:.0%} reached")

        if self.current_drawdown >= settings.max_drawdown:
            return RiskDecision(False, "max drawdown reached")

        if signal.reward_risk_ratio < self._min_reward_risk:
            return RiskDecision(
                False,
                f"reward:risk {signal.reward_risk_ratio:.2f} < {self._min_reward_risk}",
            )

        if signal.opportunity_score < settings.min_opportunity_score:
            return RiskDecision(
                False,
                f"score {signal.opportunity_score:.0f} < {settings.min_opportunity_score:.0f}",
            )

        return RiskDecision(True, "approved")

    def snapshot(self) -> dict[str, float]:
        return {
            "equity": round(self._equity, 2),
            "realized_today": round(self.realized_today, 2),
            "drawdown_pct": round(self.current_drawdown * 100, 2),
            "daily_loss_pct": round(self.daily_loss_pct * 100, 2),
            "open_positions": self._open_positions,
            "kill_switch": self._kill_switch,
        }
