"""Broker factory — returns the configured broker implementation."""
from __future__ import annotations

from app.broker.base import BrokerInterface
from app.config import BrokerMode, settings
from app.logging_config import get_logger

logger = get_logger(__name__)

_singleton: BrokerInterface | None = None


def get_broker(force_new: bool = False) -> BrokerInterface:
    """Return the process-wide broker singleton based on settings.BROKER."""
    global _singleton
    if _singleton is not None and not force_new:
        return _singleton

    if settings.broker is BrokerMode.KITE:
        from app.broker.kite_client import KiteBroker

        broker: BrokerInterface = KiteBroker()
    else:
        from app.broker.paper_broker import PaperBroker

        broker = PaperBroker()

    logger.info("Using broker: %s (dry_run=%s)", broker.name, settings.dry_run)
    _singleton = broker
    return broker
