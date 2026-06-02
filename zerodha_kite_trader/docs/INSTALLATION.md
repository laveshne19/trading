# Installation Guide

## Prerequisites

- Python 3.10+ (3.11 recommended)
- (Optional) PostgreSQL 14+ and Redis 6+ — the system falls back to SQLite + a
  JSON state file for local experiments.
- A Zerodha account with a **Kite Connect** app (only needed for live/real data):
  https://developers.kite.trade/ (₹2000/month for the API at time of writing).

## 1. Clone and enter the project

```bash
cd zerodha_kite_trader
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
```

## 2. (Optional) Install the TA-Lib C library

The indicators run on a pure-pandas fallback automatically, but TA-Lib is faster.

```bash
# Debian/Ubuntu
sudo apt-get install -y build-essential wget
wget http://prdownloads.sourceforge.net/ta-lib/ta-lib-0.4.0-src.tar.gz
tar -xzf ta-lib-0.4.0-src.tar.gz && cd ta-lib
./configure --prefix=/usr && make && sudo make install && cd ..
pip install TA-Lib

# macOS
brew install ta-lib && pip install TA-Lib
```

The Docker image installs TA-Lib for you.

## 3. Configure

```bash
cp .env.example .env
```

Edit `.env`. **Leave `BROKER=paper` and `DRY_RUN=true` to start safely.**
Fill in Postgres/Redis only if you're running them; otherwise the defaults work
with the SQLite/JSON fallback.

## 4. Initialise the database

```bash
# With Docker Postgres/Redis:
docker compose up -d postgres redis
python -m app.db.init_db
# Or, without Postgres, this creates a local trading.db SQLite file automatically.
```

## 5. Run (paper mode)

```bash
# Trading engine
python -m app.main

# Dashboard (separate terminal)
uvicorn app.api.server:app --host 0.0.0.0 --port 8000
# open http://localhost:8000
```

## 6. Going live (only after weeks of paper testing)

1. Create a Kite Connect app; note the API key & secret.
2. Put them in `.env` (`KITE_API_KEY`, `KITE_API_SECRET`).
3. Each trading day, generate the daily access token:
   ```bash
   python scripts/kite_login.py
   ```
   Paste the printed `KITE_ACCESS_TOKEN` into `.env` (or your secret store).
4. Set `BROKER=kite`. Keep `DRY_RUN=true` for one more day to watch decisions
   without sending orders. Only then set `DRY_RUN=false`.

## 7. Tests

```bash
pip install -r requirements-dev.txt
pytest -q
ruff check app tests
mypy app
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `No module named psycopg2` | Postgres optional in dev — it falls back to SQLite. Install `psycopg2-binary` for Postgres. |
| `kiteconnect is not installed` | `pip install kiteconnect`, or keep `BROKER=paper`. |
| `KITE_ACCESS_TOKEN missing` | Run `python scripts/kite_login.py` (token expires daily). |
| Dashboard shows "no data" | Start `python -m app.main`; it publishes state each cycle. |
