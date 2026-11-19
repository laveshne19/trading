"""GrowwClient smoke tests with a stubbed SDK.

We never hit Groww's API from CI. The ``FakeSdk`` class below mimics
only the methods we call; adding a new real method means adding a
fake for it here first.
"""
from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

import pytest

from trading_system.broker.client import GrowwClient
from trading_system.broker.exceptions import BrokerError, OrderRejectedError
from trading_system.broker.models import (
    CandleInterval,
    OrderRequest,
    OrderSide,
    OrderStatus,
)


class FakeSdk:
    """Record calls, return canned payloads."""

    def __init__(self, responses: dict | None = None) -> None:
        self.calls: list[tuple[str, dict]] = []
        self._responses = responses or {}

    def _handle(self, name: str, **kwargs):
        self.calls.append((name, kwargs))
        value = self._responses.get(name, {})
        if isinstance(value, Exception):
            raise value
        return value

    def __getattr__(self, name: str):
        # Lazy method generation so any SDK method name "exists".
        return lambda **kw: self._handle(name, **kw)


def _client(responses: dict | None = None) -> GrowwClient:
    return GrowwClient(raw=FakeSdk(responses or {}))


# ------------------------------------------------------------- reads

def test_get_profile_parses_payload():
    c = _client({"get_user_profile": {"user_id": "U1", "name": "Alice", "email": "a@x"}})
    p = c.get_profile()
    assert p.user_id == "U1"
    assert p.name == "Alice"
    assert p.email == "a@x"
    assert p.raw["user_id"] == "U1"


def test_get_margin_coerces_floats():
    c = _client({"get_available_margin_details": {"available_margin": "100", "used_margin": 50}})
    m = c.get_margin()
    assert m.available_margin == 100.0
    assert m.used_margin == 50.0


def test_get_ltp_filters_non_numeric():
    c = _client({"get_ltp": {"NSE_NIFTY": "24000.5", "BAD": None}})
    ltp = c.get_ltp(("NSE_NIFTY", "BAD"), segment="CASH")
    assert ltp == {"NSE_NIFTY": 24000.5}


def test_get_historical_candles_parses_epoch_ms():
    rows = [
        [1_700_000_000_000, "100", "110", "95", "105", 1000],
        [1_700_000_060_000, 105, 108, 103, 107, 1200],
    ]
    c = _client({"get_historical_candles": {"candles": rows}})
    out = c.get_historical_candles(
        exchange="NSE",
        segment="CASH",
        groww_symbol="NIFTY",
        start=datetime(2023, 11, 14, 9, 15),
        end=datetime(2023, 11, 14, 15, 30),
        interval=CandleInterval.MIN_1,
    )
    assert len(out) == 2
    assert out[0].open == 100.0 and out[0].close == 105.0
    assert out[0].volume == 1000
    assert out[1].close == 107.0


def test_get_historical_candles_empty_when_payload_blank():
    c = _client({"get_historical_candles": {}})
    out = c.get_historical_candles(
        exchange="NSE",
        segment="CASH",
        groww_symbol="NIFTY",
        start=datetime(2023, 11, 14, 9, 15),
        end=datetime(2023, 11, 14, 15, 30),
        interval=CandleInterval.MIN_1,
    )
    assert out == []


# -------------------------------------------------------- writes + errors


def test_place_order_sends_expected_fields_and_parses_id():
    sdk = FakeSdk({"place_order": {"groww_order_id": "ORD123", "order_status": "PLACED"}})
    c = GrowwClient(raw=sdk)
    req = OrderRequest(
        trading_symbol="NIFTY24DEC24000CE",
        exchange="NSE",
        segment="FNO",
        side=OrderSide.BUY,
        quantity=65,
        product="MIS",
        order_type="MARKET",
        validity="DAY",
        price=0.0,
        reference_id="ref-1",
    )
    placed = c.place_order(req)
    assert placed.broker_order_id == "ORD123"
    assert placed.status == OrderStatus.PLACED
    assert placed.reference_id == "ref-1"

    name, kwargs = sdk.calls[-1]
    assert name == "place_order"
    assert kwargs["transaction_type"] == "BUY"
    assert kwargs["quantity"] == 65
    assert kwargs["order_reference_id"] == "ref-1"


def test_place_order_rejects_when_broker_returns_no_id():
    c = _client({"place_order": {"order_status": "REJECTED"}})
    req = OrderRequest(
        trading_symbol="X",
        exchange="NSE",
        segment="FNO",
        side=OrderSide.BUY,
        quantity=1,
        product="MIS",
        order_type="MARKET",
        validity="DAY",
    )
    with pytest.raises(OrderRejectedError):
        c.place_order(req)


def test_unknown_sdk_method_raises_broker_error():
    class EmptySdk:
        pass
    c = GrowwClient(raw=EmptySdk())
    with pytest.raises(BrokerError, match="has no method"):
        c.get_profile()


def test_order_status_falls_back_to_unknown_for_novel_values():
    c = _client({"get_order_status": {"order_status": "SOME_NEW_STATE"}})
    assert c.get_order_status(broker_order_id="X", segment="FNO") == OrderStatus.UNKNOWN
