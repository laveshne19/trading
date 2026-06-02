"""Execution engine.

Turns a sized :class:`Signal` into broker orders and the resulting
:class:`Position`. Handles:

* order-type selection (market / limit / SL / SL-M / GTT),
* retries with exponential backoff on transient broker/network errors,
* rejection and partial-fill handling,
* a protective stop-loss order attached on entry,
* exit order placement when the portfolio decides to close.

Every order is persisted via the repository for the audit trail.
"""
from __future__ import annotations

import time

from app.broker.base import BrokerError, BrokerInterface
from app.db import repository
from app.domain import (
    OrderRequest,
    OrderResult,
    OrderStatus,
    OrderType,
    Position,
    Signal,
)
from app.logging_config import audit, get_logger

logger = get_logger(__name__)


class ExecutionEngine:
    """Places and manages orders through a broker."""

    def __init__(self, broker: BrokerInterface, max_retries: int = 4,
                 use_market_orders: bool = True) -> None:
        self._broker = broker
        self._max_retries = max_retries
        self._use_market = use_market_orders

    # --- low-level with retry -------------------------------------------
    def _place_with_retry(self, request: OrderRequest) -> OrderResult:
        delay = 2.0
        last_exc: Exception | None = None
        for attempt in range(1, self._max_retries + 1):
            try:
                result = self._broker.place_order(request)
                if result.status is OrderStatus.REJECTED:
                    logger.warning("Order rejected (%s): %s",
                                   request.instrument.tradingsymbol, result.message)
                return result
            except BrokerError as exc:
                last_exc = exc
                logger.warning("place_order attempt %d/%d failed: %s",
                               attempt, self._max_retries, exc)
                if attempt < self._max_retries:
                    time.sleep(delay)
                    delay *= 2
        raise BrokerError(f"order failed after {self._max_retries} retries: {last_exc}")

    # --- entry -----------------------------------------------------------
    def enter(self, signal: Signal, quantity: int, signal_id: int | None = None) -> Position | None:
        """Place the entry order (and protective stop) for a sized signal."""
        if quantity <= 0:
            return None

        entry_type = OrderType.MARKET if self._use_market else OrderType.LIMIT
        entry_req = OrderRequest(
            instrument=signal.instrument,
            side=signal.side,
            quantity=quantity,
            order_type=entry_type,
            product=signal.product,
            price=0.0 if entry_type is OrderType.MARKET else signal.entry_price,
            tag=signal.strategy[:18],
        )
        try:
            result = self._place_with_retry(entry_req)
        except BrokerError as exc:
            logger.error("Entry failed for %s: %s", signal.instrument.tradingsymbol, exc)
            return None

        repository.save_order(entry_req, result, signal.strategy)

        if result.status not in (OrderStatus.COMPLETE, OrderStatus.PARTIAL, OrderStatus.OPEN):
            logger.warning("Entry not filled for %s (status=%s)",
                           signal.instrument.tradingsymbol, result.status.value)
            return None

        filled_qty = result.filled_quantity or quantity
        fill_price = result.average_price or signal.entry_price
        if result.status is OrderStatus.PARTIAL:
            logger.info("Partial fill %d/%d for %s",
                        filled_qty, quantity, signal.instrument.tradingsymbol)

        position = Position(
            instrument=signal.instrument,
            side=signal.side,
            quantity=filled_qty,
            entry_price=fill_price,
            stop_loss=signal.stop_loss,
            target=signal.target,
            product=signal.product,
            strategy=signal.strategy,
            trading_type=signal.trading_type,
            entry_order_id=result.order_id,
            last_price=fill_price,
            highest_price=fill_price,
            lowest_price=fill_price,
        )
        position.trade_id = repository.open_trade(position, signal_id)

        # Attach a protective stop-loss order (SL-M) on the opposite side.
        self._place_protective_stop(position)

        audit(f"ENTER {signal.side.value} {filled_qty} {signal.instrument.tradingsymbol} "
              f"@ {fill_price} SL={signal.stop_loss} TGT={signal.target} [{signal.strategy}]")
        return position

    def _place_protective_stop(self, position: Position) -> str | None:
        stop_req = OrderRequest(
            instrument=position.instrument,
            side=position.side.opposite,
            quantity=position.quantity,
            order_type=OrderType.SLM,
            product=position.product,
            trigger_price=position.stop_loss,
            tag=f"sl_{position.strategy}"[:18],
        )
        try:
            result = self._place_with_retry(stop_req)
            repository.save_order(stop_req, result, position.strategy)
            position.entry_order_id = position.entry_order_id  # keep entry id
            return result.order_id
        except BrokerError as exc:
            logger.error("Failed to place protective stop for %s: %s",
                         position.instrument.tradingsymbol, exc)
            return None

    # --- exit ------------------------------------------------------------
    def exit(self, position: Position, reason: str = "manual") -> OrderResult | None:
        """Square off a position with a market order."""
        exit_req = OrderRequest(
            instrument=position.instrument,
            side=position.side.opposite,
            quantity=position.quantity,
            order_type=OrderType.MARKET,
            product=position.product,
            tag=f"exit_{position.strategy}"[:18],
        )
        try:
            result = self._place_with_retry(exit_req)
        except BrokerError as exc:
            logger.error("Exit failed for %s: %s", position.instrument.tradingsymbol, exc)
            return None

        repository.save_order(exit_req, result, position.strategy)
        audit(f"EXIT {position.instrument.tradingsymbol} qty={position.quantity} "
              f"reason={reason} @ {result.average_price}")
        return result
