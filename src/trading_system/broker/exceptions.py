"""Broker-layer exception hierarchy."""


class BrokerError(Exception):
    """Base for every broker-layer failure."""


class BrokerAuthError(BrokerError):
    """Raised when authenticating against the broker fails."""


class BrokerRateLimitError(BrokerError):
    """Raised when the broker rejects a call for rate-limit reasons."""


class OrderRejectedError(BrokerError):
    """Raised when the broker rejects an order (insufficient margin, bad
    symbol, outside session, etc)."""

    def __init__(self, message: str, *, broker_payload: dict | None = None) -> None:
        super().__init__(message)
        self.broker_payload = broker_payload or {}
