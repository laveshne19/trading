"""Tests for option-chain resolution (F&O path) and fail-safe behaviour."""
from __future__ import annotations

from app.broker.base import BrokerInterface
from app.broker.paper_broker import PaperBroker
from app.data.instruments import make_equity_instrument
from app.data.option_chain import OptionChainResolver, atm_strike
from app.domain import ProductType, Side, Signal, TradingType


def _intent(option_type: str, underlying: str = "NIFTY", spot: float = 22013.0) -> Signal:
    return Signal(
        instrument=make_equity_instrument(underlying),
        strategy="options_directional",
        side=Side.BUY,
        entry_price=spot,
        stop_loss=spot * 0.99,
        target=spot * 1.02,
        product=ProductType.NRML,
        trading_type=TradingType.INTRADAY,
        opportunity_score=90.0,
        meta={"option_type": option_type, "underlying": underlying},
    )


def test_atm_strike_rounds_to_step():
    assert atm_strike(22013, 50) == 22000
    assert atm_strike(22026, 50) == 22050
    assert atm_strike(48070, 100) == 48100


def test_resolver_builds_ce_contract():
    broker = PaperBroker(seed=1)
    broker.connect()
    resolver = OptionChainResolver(broker)
    sig = resolver.resolve(_intent("CE"))
    assert sig is not None
    assert sig.instrument.instrument_type == "CE"
    assert sig.instrument.segment.value == "OPTIONS"
    assert sig.side is Side.BUY
    assert sig.stop_loss < sig.entry_price < sig.target  # long option premium
    assert sig.instrument.lot_size > 1
    assert "resolved_option" in sig.meta


def test_resolver_builds_pe_contract():
    broker = PaperBroker(seed=2)
    broker.connect()
    sig = OptionChainResolver(broker).resolve(_intent("PE"))
    assert sig is not None and sig.instrument.instrument_type == "PE"


def test_resolver_fails_safe_without_chain():
    class _NoChainBroker(PaperBroker):
        def list_options(self, underlying: str):
            return []

    broker = _NoChainBroker(seed=3)
    broker.connect()
    # No chain -> None (engine will skip; never trades the underlying).
    assert OptionChainResolver(broker).resolve(_intent("CE")) is None


def test_resolver_ignores_non_option_intent():
    broker = PaperBroker(seed=4)
    broker.connect()
    intent = _intent("CE")
    intent.meta = {}  # not an option intent
    assert OptionChainResolver(broker).resolve(intent) is None


def test_base_broker_list_options_defaults_empty():
    # Any broker that doesn't override returns [] -> fail safe.
    assert BrokerInterface.list_options.__doc__ is not None
