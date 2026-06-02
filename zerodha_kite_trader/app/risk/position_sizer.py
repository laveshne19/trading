"""Position sizing based on fixed-fractional risk.

Quantity is chosen so that hitting the stop loses approximately
``risk_per_trade_pct`` of current equity, respecting lot sizes for derivatives
and available margin.
"""
from __future__ import annotations

import math

from app.config import settings
from app.domain import Signal
from app.logging_config import get_logger

logger = get_logger(__name__)


class PositionSizer:
    """Computes order quantity for a signal."""

    def __init__(self, risk_per_trade: float | None = None) -> None:
        self._risk = risk_per_trade if risk_per_trade is not None else settings.risk_per_trade

    def size(self, signal: Signal, equity: float, available_margin: float) -> int:
        """Return the integer quantity (multiple of lot size) to trade.

        Returns 0 when the trade cannot be sized within risk/margin limits.
        """
        risk_per_unit = signal.risk_per_unit
        if risk_per_unit <= 0:
            logger.warning("Zero risk-per-unit for %s; skipping", signal.instrument.tradingsymbol)
            return 0

        risk_budget = equity * self._risk
        raw_qty = risk_budget / risk_per_unit

        lot = max(signal.instrument.lot_size, 1)
        qty = int(math.floor(raw_qty / lot) * lot)
        if qty <= 0:
            # For derivatives, refuse to take less than one lot if it breaches risk.
            min_lot_risk = lot * risk_per_unit
            if signal.instrument.is_derivative and min_lot_risk > risk_budget * 1.5:
                logger.info("One lot of %s risks ₹%.0f > budget ₹%.0f; skipping",
                            signal.instrument.tradingsymbol, min_lot_risk, risk_budget)
                return 0
            qty = lot if signal.instrument.is_derivative else 0
            if qty == 0:
                return 0

        # Cap by available margin (approximate; real margin via Kite margins API).
        notional = signal.entry_price * qty
        if notional > available_margin:
            affordable = int(math.floor(available_margin / signal.entry_price / lot) * lot)
            if affordable <= 0:
                logger.info("Insufficient margin for %s (need ₹%.0f, have ₹%.0f)",
                            signal.instrument.tradingsymbol, notional, available_margin)
                return 0
            qty = affordable

        return qty
