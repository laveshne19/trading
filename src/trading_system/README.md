# 9/21 EMA Live-Trading System

Groww-backed intraday 9/21 EMA crossover strategy on NIFTY index
options. **Stage 1 of a staged build** — this ships scaffolding only:
broker client, config, database schema. No trading logic yet.

## What's here

```
src/trading_system/
  config.py             Env-driven configuration
  broker/
    client.py           GrowwClient — typed wrapper over growwapi SDK
    auth.py             TOTP-based access-token exchange
    models.py           Typed broker payloads (dataclasses)
    exceptions.py       BrokerError hierarchy
  database/
    models.py           SQLAlchemy 2.0 models
    session.py          Engine + session factory
    migrations/         Alembic migrations
  strategy/             (stubs — Stage 2)
  data/                 (stubs — Stage 2)
```

## What's coming

| Stage | Adds                                                              |
|-------|-------------------------------------------------------------------|
| 1 ✓   | scaffolding + broker client + DB schema (this PR)                 |
| 2     | EMA engine + signal detector + 1m backfill job                    |
| 3     | Paper-trading live loop with kill switch                          |
| 4     | Flask dashboard (trade list, chart, KPI row, cost card)           |
| 5     | Real-money live trading behind feature flag + daily safety caps   |

## Setup

```bash
# 1. Install trading-system deps (separate from tradingview-mcp deps)
pip install -e ".[trading,trading-dev]"

# 2. Copy and fill .env
cp .env.example .env
# Edit .env: set GROWW_API_KEY, GROWW_TOTP_SECRET, DATABASE_URL

# 3. Start Postgres
docker compose up -d postgres

# 4. Run migrations
alembic upgrade head

# 5. Run the tests (no network, no DB required)
pytest tests/trading_system/
```

## Design notes

* **Paper trading defaults to ON.** `PAPER_TRADING=true` in `.env.example`
  means the live loop (once it exists) simulates orders without sending
  them to Groww. You have to explicitly flip it off.
* **Only 1-minute candles are stored.** Higher timeframes (5m/15m/30m)
  are resampled at query time, aligned to the 09:15 IST open. This
  keeps backfill cheap and lets us change alignment logic without
  re-downloading history.
* **Broker is behind an interface.** `GrowwClient` returns typed
  dataclasses, not SDK dicts, so strategy code never imports `growwapi`
  directly. Mock the client in tests (see `tests/trading_system/test_broker_client.py`).
* **Alembic manages schema.** `alembic.ini` lives at the repo root;
  migrations live under `src/trading_system/database/migrations/versions/`.
  `DATABASE_URL` is read from env by `env.py`, never committed.

## Running tests

```bash
pytest tests/trading_system/ -v
```

No Groww credentials, no Postgres, no network needed — the tests stub
the SDK and run models against SQLite in-memory.
