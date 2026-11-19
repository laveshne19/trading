"""SQLAlchemy model + migration sanity tests.

Uses SQLite in-memory — good enough to prove the ORM mapping is
well-formed. The Postgres-only bits (JSONB, server_default sa.func.now)
are exercised by Alembic against real Postgres in integration tests
(not shipped in Stage 1).
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from trading_system.database.models import (
    Base,
    Candle1m,
    OptionInstrument,
    Order,
    Trade,
)


@pytest.fixture
def session() -> Session:
    engine = create_engine("sqlite:///:memory:", future=True)
    # JSONB -> JSON on SQLite via dialect fallback; CheckConstraint syntax
    # is portable. We only create the tables Candle1m & Trade here; the
    # Order / OptionInstrument tables rely on a Postgres-only column type
    # (JSONB) that SQLite handles as generic JSON — fine for the mapping
    # sanity test.
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as s:
        yield s


def test_candle_round_trip(session: Session):
    row = Candle1m(
        symbol="NIFTY",
        ts=datetime(2026, 11, 19, 9, 15, tzinfo=timezone.utc),
        open=Decimal("24000.00"),
        high=Decimal("24100.00"),
        low=Decimal("23950.00"),
        close=Decimal("24050.00"),
        volume=None,
    )
    session.add(row)
    session.commit()

    got = session.query(Candle1m).one()
    assert got.symbol == "NIFTY"
    assert got.close == Decimal("24050.00")


def test_candle_unique_per_symbol_ts(session: Session):
    ts = datetime(2026, 11, 19, 9, 15, tzinfo=timezone.utc)
    session.add(Candle1m(
        symbol="NIFTY", ts=ts,
        open=Decimal("1"), high=Decimal("1"), low=Decimal("1"), close=Decimal("1"),
    ))
    session.commit()
    session.add(Candle1m(
        symbol="NIFTY", ts=ts,
        open=Decimal("2"), high=Decimal("2"), low=Decimal("2"), close=Decimal("2"),
    ))
    with pytest.raises(Exception):  # IntegrityError wrapped by dialect
        session.commit()


def test_trade_has_null_exit_by_default(session: Session):
    t = Trade(
        underlying="NIFTY",
        trading_symbol="NIFTY24DEC24000CE",
        mode="ATM_BUY",
        direction="LONG",
        timeframe="15m",
        quantity=65,
        opened_at=datetime(2026, 11, 19, 9, 30, tzinfo=timezone.utc),
    )
    session.add(t)
    session.commit()
    assert t.closed_at is None
    assert t.exit_reason is None
    assert t.is_paper is False
    assert t.whipsaw is False


def test_option_instrument_rejects_bad_type(session: Session):
    with pytest.raises(Exception):
        session.add(OptionInstrument(
            exchange="NSE",
            trading_symbol="X",
            underlying="NIFTY",
            expiry=datetime(2026, 12, 25, tzinfo=timezone.utc),
            strike=Decimal("24000"),
            option_type="XX",  # not CE/PE
            lot_size=65,
        ))
        session.commit()


def test_metadata_includes_all_four_tables():
    tables = set(Base.metadata.tables.keys())
    assert tables == {"candles_1m", "option_instruments", "orders", "trades"}
