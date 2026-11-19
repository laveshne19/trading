"""Broker integration layer.

The only broker this project targets is Groww. The ``GrowwClient`` in
``client`` is a thin typed wrapper around the ``growwapi`` SDK; strategy
code should depend on this interface, not on ``growwapi`` directly, so
we can swap or mock the broker in tests.
"""

from trading_system.broker.client import GrowwClient
from trading_system.broker.exceptions import (
    BrokerAuthError,
    BrokerError,
    BrokerRateLimitError,
    OrderRejectedError,
)
from trading_system.broker.models import (
    Candle,
    CandleInterval,
    MarginDetails,
    OptionContract,
    OrderRequest,
    OrderSide,
    OrderStatus,
    PlacedOrder,
    Quote,
    UserProfile,
)

__all__ = [
    "GrowwClient",
    "BrokerAuthError",
    "BrokerError",
    "BrokerRateLimitError",
    "OrderRejectedError",
    "Candle",
    "CandleInterval",
    "MarginDetails",
    "OptionContract",
    "OrderRequest",
    "OrderSide",
    "OrderStatus",
    "PlacedOrder",
    "Quote",
    "UserProfile",
]
