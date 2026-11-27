"""Broker interface. Execution code depends only on this, so PAPER and LIVE share one code path."""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


class BrokerError(Exception):
    """Outcome unknown unless a subclass says otherwise."""


class BrokerRejected(BrokerError):
    """Definitively not placed."""


class RateLimited(BrokerRejected):
    """Definitively not placed (throttled)."""


class BrokerTimeout(BrokerError):
    """The order MAY or MAY NOT exist. Never retry blindly."""


@dataclass
class BrokerOrder:
    broker_order_id: str
    symbol: str
    side: str
    qty: int
    order_type: str          # MARKET, LIMIT, SL_M
    status: str              # OPEN, PARTIAL, FILLED, CANCELLED, REJECTED
    filled_qty: int = 0
    avg_price: Optional[float] = None
    price: Optional[float] = None
    trigger: Optional[float] = None
    client_ref: Optional[str] = None
    reject_reason: Optional[str] = None


class Broker(ABC):
    @abstractmethod
    def place_order(self, symbol, side, qty, order_type, product, price=None, trigger=None, client_ref=None) -> str: ...
    @abstractmethod
    def get_order(self, broker_order_id) -> BrokerOrder: ...
    @abstractmethod
    def find_order_by_ref(self, client_ref) -> Optional[BrokerOrder]: ...
    @abstractmethod
    def cancel_order(self, broker_order_id) -> None: ...
    @abstractmethod
    def get_positions(self) -> dict: ...
    @abstractmethod
    def get_ltp(self, symbol) -> float: ...
    @abstractmethod
    def get_funds(self) -> float: ...
