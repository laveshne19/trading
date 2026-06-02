"""Tests for the paper broker."""
from __future__ import annotations

from app.broker.paper_broker import PaperBroker
from app.data.instruments import make_equity_instrument
from app.domain import OrderRequest, OrderStatus, OrderType, ProductType, Side


def test_connect_and_margin():
    broker = PaperBroker(starting_cash=100_000, seed=1)
    broker.connect()
    assert broker.is_connected()
    assert broker.get_available_margin() == 100_000


def test_market_buy_fills_and_reduces_cash():
    broker = PaperBroker(starting_cash=100_000, seed=1)
    broker.connect()
    inst = make_equity_instrument("TEST")
    broker.set_price(inst, 100.0)
    req = OrderRequest(inst, Side.BUY, 10, OrderType.MARKET, ProductType.MIS)
    result = broker.place_order(req)
    assert result.status is OrderStatus.COMPLETE
    assert result.filled_quantity == 10
    assert broker.get_available_margin() < 100_000
    assert len(broker.get_positions()) == 1


def test_insufficient_margin_rejected():
    broker = PaperBroker(starting_cash=500, seed=1)
    broker.connect()
    inst = make_equity_instrument("TEST")
    broker.set_price(inst, 100.0)
    req = OrderRequest(inst, Side.BUY, 100, OrderType.MARKET, ProductType.MIS)
    result = broker.place_order(req)
    assert result.status is OrderStatus.REJECTED


def test_historical_returns_candles():
    broker = PaperBroker(seed=2)
    broker.connect()
    inst = make_equity_instrument("TEST")
    candles = broker.get_historical(inst, "minute", days=2)
    assert len(candles) > 0
    assert all(c.high >= c.low for c in candles)
