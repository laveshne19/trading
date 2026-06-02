"""Portfolio manager.

Owns the set of live positions and, on every price update, decides whether to:

* move the trailing stop up (long) / down (short),
* exit on stop-loss hit,
* exit on target hit,
* exit on intraday square-off time.

Realized P&L (net of estimated charges) is reported back to the risk manager and
persisted. This is the automatic position / stop-loss / profit-booking module.
"""
from __future__ import annotations

from datetime import datetime

from app.config import settings
from app.db import repository
from app.domain import Position, Side
from app.execution.execution_engine import ExecutionEngine
from app.logging_config import get_logger
from app.risk.charges import round_trip_charges
from app.risk.risk_manager import RiskManager

logger = get_logger(__name__)


class PortfolioManager:
    """Tracks open positions and manages exits."""

    def __init__(
        self,
        execution: ExecutionEngine,
        risk: RiskManager,
        trail_atr_mult: float = 1.0,
        on_exit=None,  # optional callback(position, pnl, reason)
    ) -> None:
        self._exec = execution
        self._risk = risk
        self._trail_mult = trail_atr_mult
        self._positions: dict[int, Position] = {}
        self._on_exit = on_exit

    # --- registration ----------------------------------------------------
    def add(self, position: Position) -> None:
        self._positions[position.instrument.instrument_token] = position
        self._risk.on_position_opened()
        logger.info("Tracking position %s %s qty=%d entry=%.2f",
                    position.side.value, position.instrument.tradingsymbol,
                    position.quantity, position.entry_price)

    @property
    def positions(self) -> list[Position]:
        return list(self._positions.values())

    @property
    def has_capacity(self) -> bool:
        return len(self._positions) < settings.max_open_positions

    def is_open(self, instrument_token: int) -> bool:
        return instrument_token in self._positions

    # --- mark to market --------------------------------------------------
    def total_unrealized(self, prices: dict[int, float]) -> float:
        total = 0.0
        for pos in self._positions.values():
            price = prices.get(pos.instrument.instrument_token, pos.last_price)
            total += pos.unrealized_pnl(price)
        return total

    def update_price(self, instrument_token: int, price: float) -> None:
        """Process a price tick for one position; may trigger an exit."""
        pos = self._positions.get(instrument_token)
        if pos is None:
            return
        pos.last_price = price
        pos.highest_price = max(pos.highest_price or price, price)
        pos.lowest_price = min(pos.lowest_price or price, price)

        # Trailing stop.
        self._apply_trailing_stop(pos)

        # Exit conditions.
        if self._stop_hit(pos, price):
            self.close(pos, reason="stop_loss")
        elif self._target_hit(pos, price):
            self.close(pos, reason="target")

    def _apply_trailing_stop(self, pos: Position) -> None:
        # Trail the stop by the initial risk distance once price moves favourably,
        # locking in profit while never loosening the stop.
        if pos.side is Side.BUY:
            # lock in: new stop = max(old, highest - trail_distance)
            trail_distance = (pos.entry_price - pos.stop_loss)  # initial risk
            candidate = pos.highest_price - trail_distance
            if candidate > pos.stop_loss:
                pos.stop_loss = round(candidate, 2)
        else:
            trail_distance = (pos.stop_loss - pos.entry_price)
            candidate = pos.lowest_price + trail_distance
            if candidate < pos.stop_loss:
                pos.stop_loss = round(candidate, 2)

    @staticmethod
    def _stop_hit(pos: Position, price: float) -> bool:
        if pos.side is Side.BUY:
            return price <= pos.stop_loss
        return price >= pos.stop_loss

    @staticmethod
    def _target_hit(pos: Position, price: float) -> bool:
        if pos.target <= 0:
            return False
        if pos.side is Side.BUY:
            return price >= pos.target
        return price <= pos.target

    # --- session square-off ---------------------------------------------
    def square_off_intraday(self, now: datetime | None = None) -> None:
        """Force-close all intraday (MIS) positions at the square-off time."""
        from app.domain import ProductType, TradingType

        now = now or datetime.now()
        if now.time() < settings.square_off_t:
            return
        for pos in list(self._positions.values()):
            if pos.product is ProductType.MIS or pos.trading_type is TradingType.INTRADAY:
                self.close(pos, reason="square_off")

    # --- close -----------------------------------------------------------
    def close(self, pos: Position, reason: str) -> float:
        token = pos.instrument.instrument_token
        if token not in self._positions:
            return 0.0
        result = self._exec.exit(pos, reason=reason)
        exit_price = (result.average_price if result and result.average_price else pos.last_price)

        gross = pos.unrealized_pnl(exit_price)
        charges = round_trip_charges(
            pos.instrument.segment, pos.product, pos.entry_price, exit_price, pos.quantity
        )
        net = gross - charges

        if pos.trade_id is not None:
            repository.close_trade(pos.trade_id, exit_price, gross, charges, reason)

        del self._positions[token]
        self._risk.on_position_closed(net)
        logger.info("Closed %s (%s): gross=₹%.2f charges=₹%.2f net=₹%.2f",
                    pos.instrument.tradingsymbol, reason, gross, charges, net)
        if self._on_exit is not None:
            try:
                self._on_exit(pos, net, reason)
            except Exception:
                logger.exception("on_exit callback failed")
        return net

    def close_all(self, reason: str = "shutdown") -> None:
        for pos in list(self._positions.values()):
            self.close(pos, reason=reason)
