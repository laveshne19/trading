# Architecture

## Overview

The system is a single long-lived **orchestrator** process (`app/main.py`) that
runs a decision cycle on a fixed interval, plus a separate **dashboard** process
(`app/api/server.py`). They communicate through PostgreSQL (durable records) and
a lightweight runtime-state channel (`app/state.py`, Redis or a JSON file).

```
 scan → score → strategy → ML filter → risk gate → size → execute → manage → publish
```

Every stage is a small, independently testable module behind a clear interface.

## Module responsibilities

| Layer | Module | Responsibility |
|---|---|---|
| Config | `app/config.py` | Typed settings from env (pydantic-settings). Single source of truth. |
| Domain | `app/domain.py` | Framework-agnostic dataclasses/enums (Instrument, Signal, Position, …). |
| Broker | `app/broker/` | `BrokerInterface` with `KiteBroker` (live) and `PaperBroker` (sim) behind a factory. |
| Data | `app/data/` | Instrument universe, cached candle/quote service, KiteTicker WebSocket. |
| Indicators | `app/indicators/` | TA-Lib-or-pandas EMA/RSI/MACD/ATR/Bollinger/Supertrend/VWAP/RVOL. |
| Scanner | `app/scanner/` | Pattern detectors + universe sweep → `Opportunity` objects + feature vectors. |
| Scoring | `app/scoring/` | Transparent weighted 0–100 opportunity score. |
| Strategies | `app/strategies/` | Trend / Breakout / Options / Mean-Reversion / MCX → `Signal` with SL & target. |
| ML | `app/ml/` | XGBoost/sklearn probability-of-success filter (heuristic fallback). |
| Risk | `app/risk/` | Position sizing, cost model, hard limits + kill switch. |
| Execution | `app/execution/` | Order placement with retries, protective stops, partial-fill handling. |
| Portfolio | `app/portfolio/` | Live positions, trailing stops, SL/target/square-off exits, realized P&L. |
| Notifications | `app/notifications/` | Telegram alerts (graceful no-op when disabled). |
| Persistence | `app/db/` | SQLAlchemy models, sessions, repositories. |
| Backtest | `app/backtest/` | Event-driven replay through the *same* pipeline + metrics. |
| API | `app/api/` | FastAPI dashboard + control endpoints. |
| Orchestrator | `app/main.py` | Wires it all together and runs the loop. |

## Decision cycle (`TradingEngine._tick`)

1. Honour any dashboard kill-switch request.
2. **Manage open positions** every cycle: update prices, trail stops, exit on
   SL/target, mark-to-market equity for drawdown.
3. If market closed → maybe send daily summary, publish state, return.
4. If kill switch active → publish, return (no new entries; existing exits still run).
5. Intraday square-off after `SQUARE_OFF_TIME`.
6. If capacity for more positions:
   - scan universe → score → keep `score > MIN_OPPORTUNITY_SCORE`,
   - build a strategy signal,
   - ML filter (`probability ≥ ML_CONFIDENCE_THRESHOLD`),
   - risk gate (limits, reward:risk, score),
   - size and execute (entry + protective SL-M), track, alert.
7. Publish runtime state for the dashboard.

## Why "score > 80" is necessary but not sufficient

The 0–100 score ranks *setups*. The ML layer estimates *probability of success*
on top. Both gate entry. But profitability ultimately comes from **expectancy**:

```
expectancy_R = p · (reward/risk) − (1 − p)
net_edge     = expectancy_R · avg_risk − round_trip_costs
```

The risk engine rejects any signal whose reward:risk is below `1.2`, the cost
model (`app/risk/charges.py`) is applied to every simulated and live trade, and
the backtester reports profit factor / expectancy so you can see the real edge
before risking capital. See the honesty note in the top-level `README.md`.

## Failure handling

- **Broker/network**: `tenacity` exponential-backoff retries (2/4/8/16 s) on
  Kite calls; execution retries up to 4 times then gives up safely.
- **Rejections / partial fills**: surfaced as `OrderStatus`, persisted, and the
  engine only tracks a position for the actually-filled quantity.
- **DB down (dev)**: automatic SQLite fallback (never in `ENV=production`).
- **Redis down**: state falls back to a local JSON file.
- **Crash mid-loop**: positions and protective SL-M orders already live at the
  broker; on restart, `KiteBroker.get_positions()` reflects reality.
