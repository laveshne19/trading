"""Abstract broker interface.

Both the live :class:`KiteBroker` and the :class:`PaperBroker` implement this,
so the execution engine never knows which one it is talking to.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.domain import Candle, Instrument, OrderRequest, OrderResult, Position, Quote


class BrokerError(Exception):
    """Raised for any broker-side failure (network, rejection, auth)."""


class BrokerInterface(ABC):
    """Contract every broker implementation must satisfy."""

    name: str = "base"

    # --- lifecycle -------------------------------------------------------
    @abstractmethod
    def connect(self) -> None:
        """Authenticate / establish the session."""

    @abstractmethod
    def is_connected(self) -> bool:
        ...

    # --- account ---------------------------------------------------------
    @abstractmethod
    def get_available_margin(self) -> float:
        """Cash available to deploy (₹)."""

    @abstractmethod
    def get_positions(self) -> list[Position]:
        ...

    # --- market data -----------------------------------------------------
    @abstractmethod
    def get_quote(self, instrument: Instrument) -> Quote:
        ...

    @abstractmethod
    def get_historical(
        self, instrument: Instrument, interval: str, days: int
    ) -> list[Candle]:
        """Return historical OHLCV candles, oldest first."""

    # --- orders ----------------------------------------------------------
    @abstractmethod
    def place_order(self, request: OrderRequest) -> OrderResult:
        ...

    @abstractmethod
    def modify_order(
        self, order_id: str, price: float | None = None, trigger_price: float | None = None
    ) -> OrderResult:
        ...

    @abstractmethod
    def cancel_order(self, order_id: str) -> OrderResult:
        ...

    @abstractmethod
    def get_order_status(self, order_id: str) -> OrderResult:
        ...

    # --- GTT -------------------------------------------------------------
    @abstractmethod
    def place_gtt(
        self, instrument: Instrument, trigger_price: float, request: OrderRequest
    ) -> str:
        """Place a Good-Till-Triggered order; returns the GTT id."""
