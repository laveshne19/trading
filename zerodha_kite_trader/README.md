# Zerodha Kite — Automated Algorithmic Trading System

A production-grade, modular automated trading platform for **Zerodha Kite Connect**,
covering NSE Equity, Futures, Options and MCX Commodities with intraday and
positional strategies, an AI opportunity-scoring engine, ML-based trade filtering,
strict risk management, a FastAPI dashboard, Telegram alerts and a backtesting engine.

> ⚠️ **Read this first — honest expectations**
>
> This software is an *engineering framework*, not a money-printing machine.
> With ₹1,00,000 of capital, profitability is **not** guaranteed by "60% accuracy".
> Net edge = `win_rate × avg_win − loss_rate × avg_loss − costs − slippage`.
> A 40%-accuracy system with a 2.5R reward:risk can be profitable; a 60%-accuracy
> system with poor reward:risk and high churn will bleed via brokerage, STT, GST,
> stamp duty, exchange fees and slippage. **Run in paper / dry-run mode for weeks,
> measure your real costs, and only then risk capital you can afford to lose.**
> Algorithmic trading carries substantial risk of loss. Nothing here is financial advice.

---

## ✨ Features

| Module | What it does |
|---|---|
| **Market Scanner** | Continuously scans Nifty 50, Bank Nifty, FinNifty, midcaps, liquid option chains and MCX for breakouts, volume surges, momentum, reversals, trend continuation and volatility expansion. |
| **AI Scoring Engine** | Scores every opportunity 0–100 from trend, RVOL, OI, PCR, VWAP, ATR, RSI, MACD, Supertrend, EMA alignment and market breadth. Trades only when score > 80. |
| **Strategy Library** | Trend Following, Breakout (ORB / volume / day-high), Options (directional CE/PE, ATM momentum), Mean Reversion (RSI / Bollinger), MCX momentum & trend. |
| **Risk Engine** | 1% risk/trade, 3% daily-loss cap, 10% max drawdown, max 3 concurrent positions, auto position sizing, auto SL, trailing SL, emergency kill switch. |
| **Execution Engine** | Market / Limit / SL / SL-M / GTT orders; handles rejections, slippage, partial fills, retries on network failures. |
| **ML Layer** | Learns from historical trades to estimate probability of success, expected return and a confidence score; trades only above a configurable confidence threshold. |
| **Dashboard** | FastAPI + lightweight HTML/JS showing live P&L, open positions, capital used, drawdown, win rate, daily trades, strategy performance and signals. |
| **Telegram** | Entry / exit / SL / target / daily-summary / risk alerts. |
| **Database** | PostgreSQL storing orders, trades, signals, market data, strategy logs, performance metrics. |
| **Backtester** | NSE / Options / MCX backtests reporting CAGR, Sharpe, Sortino, max drawdown, win rate, profit factor. |

## 🏗️ Architecture

```
                         ┌────────────────────────────────────────────┐
                         │                Orchestrator                 │
                         │           (app/main.py event loop)          │
                         └───────┬───────────────┬──────────────┬──────┘
                                 │               │              │
        ┌────────────┐   ┌───────▼──────┐  ┌─────▼──────┐  ┌────▼────────┐
        │  Market    │   │   Scanner    │  │  Scoring   │  │     ML      │
        │  Data /    │──▶│  (patterns)  │─▶│  Engine    │─▶│   Filter    │
        │  WebSocket │   └──────────────┘  └────────────┘  └────┬────────┘
        └─────┬──────┘                                          │
              │                                          ┌──────▼───────┐
        ┌─────▼──────┐                                   │  Strategies  │
        │  Broker    │                                   └──────┬───────┘
        │  (Kite /   │◀──────────┐                              │
        │   Paper)   │           │                       ┌──────▼───────┐
        └─────┬──────┘    ┌──────┴───────┐    signals    │     Risk     │
              │           │  Execution   │◀──────────────│   Manager    │
              │           │   Engine     │   sized order └──────┬───────┘
              │           └──────┬───────┘                      │
              │                  │                       ┌──────▼───────┐
        ┌─────▼──────────────────▼───────┐              │  Portfolio   │
        │  PostgreSQL + Redis (state)     │◀─────────────│   Manager    │
        └─────────────────────────────────┘              └──────┬───────┘
                       ▲                                         │
              ┌────────┴─────────┐                       ┌───────▼───────┐
              │  FastAPI Board   │                       │   Telegram    │
              └──────────────────┘                       └───────────────┘
```

## 🚀 Quick start (paper mode, no real money)

```bash
cd zerodha_kite_trader
cp .env.example .env            # fill in values; leave BROKER=paper to start safe
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# optional: bring up Postgres + Redis
docker compose up -d postgres redis
# initialise the database schema
python -m app.db.init_db
# run the trading engine in dry-run / paper mode
python -m app.main
# in another shell, start the dashboard
uvicorn app.api.server:app --reload --port 8000
```

Open http://localhost:8000 for the dashboard.

Full docs: [Installation](docs/INSTALLATION.md) ·
[Architecture](docs/ARCHITECTURE.md) ·
[Production Deployment](docs/DEPLOYMENT.md) ·
[VPS Deployment](docs/VPS_DEPLOYMENT.md) ·
[Security](docs/SECURITY.md)

## 🧪 Tests

```bash
pip install -r requirements-dev.txt
pytest -q
```

## 📁 Project layout

```
zerodha_kite_trader/
├── app/
│   ├── config.py            # pydantic-settings config from env
│   ├── logging_config.py    # structured logging
│   ├── main.py              # orchestrator / trading loop
│   ├── api/                 # FastAPI dashboard
│   ├── broker/              # Kite + paper broker behind one interface
│   ├── data/                # instruments, market data, websocket stream
│   ├── scanner/             # market scanner + pattern detectors
│   ├── indicators/          # TA-Lib backed technical indicators (+ pure-python fallback)
│   ├── scoring/             # 0–100 opportunity scorer
│   ├── strategies/          # strategy library
│   ├── risk/                # risk manager + position sizing
│   ├── execution/           # execution + order management
│   ├── ml/                  # feature engineering, model, trainer
│   ├── portfolio/           # live position & P&L tracking
│   ├── notifications/       # telegram
│   ├── db/                  # SQLAlchemy models, session, repositories
│   ├── backtest/            # backtesting engine + metrics
│   └── utils/               # shared helpers
├── tests/
├── docs/
├── scripts/
├── schema.sql               # raw DDL (mirror of SQLAlchemy models)
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── .env.example
```

## ⚖️ License

MIT. Use at your own risk. The authors are not responsible for any financial loss.
