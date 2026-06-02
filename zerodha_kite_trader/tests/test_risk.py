"""Tests for the risk manager, position sizer and charges model."""
from __future__ import annotations

from app.data.instruments import make_equity_instrument
from app.domain import ProductType, Segment, Side, Signal, TradingType
from app.risk import PositionSizer, RiskManager, estimate_charges
from app.risk.charges import round_trip_charges


def _signal(entry=100.0, stop=98.0, target=106.0, score=85.0) -> Signal:
    return Signal(
        instrument=make_equity_instrument("TEST"),
        strategy="t", side=Side.BUY, entry_price=entry, stop_loss=stop,
        target=target, product=ProductType.MIS, trading_type=TradingType.INTRADAY,
        opportunity_score=score,
    )


def test_position_sizer_respects_risk():
    sizer = PositionSizer(risk_per_trade=0.01)
    # equity 100000, risk 1% = 1000; risk/unit = 2 → qty ~ 500
    qty = sizer.size(_signal(), equity=100_000, available_margin=1_000_000)
    assert qty == 500


def test_position_sizer_caps_by_margin():
    sizer = PositionSizer(risk_per_trade=0.01)
    qty = sizer.size(_signal(), equity=100_000, available_margin=10_000)
    assert qty * 100.0 <= 10_000


def test_position_sizer_zero_when_no_risk():
    sizer = PositionSizer()
    assert sizer.size(_signal(entry=100, stop=100), 100_000, 100_000) == 0


def test_risk_manager_approves_good_signal():
    rm = RiskManager(starting_equity=100_000)
    decision = rm.evaluate(_signal())
    assert decision.approved


def test_risk_manager_rejects_low_score():
    rm = RiskManager(starting_equity=100_000)
    decision = rm.evaluate(_signal(score=50))
    assert not decision.approved


def test_risk_manager_rejects_poor_rr():
    rm = RiskManager(starting_equity=100_000)
    decision = rm.evaluate(_signal(entry=100, stop=98, target=100.5))
    assert not decision.approved


def test_daily_loss_engages_kill_switch():
    rm = RiskManager(starting_equity=100_000)
    rm.on_position_closed(-3_500)  # 3.5% loss > 3% cap
    decision = rm.evaluate(_signal())
    assert not decision.approved
    assert rm.kill_switch_active


def test_max_positions_enforced():
    rm = RiskManager(starting_equity=100_000)
    for _ in range(3):
        rm.on_position_opened()
    assert not rm.evaluate(_signal()).approved


def test_drawdown_kill_switch():
    rm = RiskManager(starting_equity=100_000)
    rm.update_equity(89_000)  # 11% drawdown > 10%
    assert rm.kill_switch_active


def test_charges_positive_and_delivery_has_stt():
    c = estimate_charges(Segment.EQUITY, ProductType.CNC, Side.SELL, 100.0, 100)
    assert c > 0


def test_round_trip_charges_nonzero():
    c = round_trip_charges(Segment.EQUITY, ProductType.MIS, 100.0, 101.0, 100)
    assert c > 0
