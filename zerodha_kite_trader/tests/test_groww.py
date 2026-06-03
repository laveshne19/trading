"""Tests for the Groww broker mapping and guards.

These run without the ``growwapi`` SDK installed (it's an optional import),
exercising the pure mapping logic and the safety guards.
"""
from __future__ import annotations

import pytest

from app.broker import groww_client
from app.broker.base import BrokerError
from app.broker.groww_client import _EXCHANGE, _ORDER_TYPE, _PRODUCT, _segment
from app.domain import (
    Exchange,
    Instrument,
    OrderType,
    ProductType,
    Segment,
)


def _equity() -> Instrument:
    return Instrument(1, "RELIANCE", "RELIANCE", Exchange.NSE, Segment.EQUITY)


def _option() -> Instrument:
    return Instrument(2, "NIFTY24000CE", "NIFTY", Exchange.NFO, Segment.OPTIONS,
                      lot_size=50, instrument_type="CE")


def _commodity() -> Instrument:
    return Instrument(3, "GOLD", "GOLD", Exchange.MCX, Segment.COMMODITY)


def test_segment_equity_is_cash():
    assert _segment(_equity()) == "CASH"


def test_segment_derivative_is_fno():
    assert _segment(_option()) == "FNO"


def test_segment_commodity_rejected():
    with pytest.raises(BrokerError):
        _segment(_commodity())


def test_value_maps_cover_enums():
    assert _EXCHANGE[Exchange.NSE] == "NSE"
    assert _PRODUCT[ProductType.MIS] == "MIS"
    assert _ORDER_TYPE[OrderType.SLM] == "SL_M"
    assert _ORDER_TYPE[OrderType.MARKET] == "MARKET"


def test_constructor_requires_sdk(monkeypatch):
    # Force the "SDK missing" branch regardless of the environment.
    monkeypatch.setattr(groww_client, "_HAS_GROWW", False)
    with pytest.raises(BrokerError, match="growwapi is not installed"):
        groww_client.GrowwBroker()
