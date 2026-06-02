# Production Deployment Guide

## Recommended topology

```
            ┌──────────────────────────────┐
            │           VPS / Host          │
            │  ┌────────┐  ┌────────────┐  │
  Browser ──┼─▶│dashboard│  │   engine   │  │──▶ Zerodha Kite API
            │  └────┬───┘  └─────┬──────┘  │
            │       │  ┌─────────┴───┐     │
            │       └─▶│ Postgres+Redis│    │
            │          └───────────────┘    │
            └──────────────────────────────┘
```

## Option A — Docker Compose (simplest)

```bash
cp .env.example .env       # configure; start with BROKER=paper
docker compose build
docker compose up -d
docker compose logs -f engine
```

Services: `postgres`, `redis`, `engine`, `dashboard` (port 8000).
Volumes persist Postgres data, logs and trained models.

To update:

```bash
git pull && docker compose build && docker compose up -d
```

## Option B — systemd (bare metal / VPS)

Create `/etc/systemd/system/kite-engine.service`:

```ini
[Unit]
Description=Kite Trading Engine
After=network-online.target postgresql.service redis.service

[Service]
Type=simple
User=trader
WorkingDirectory=/opt/zerodha_kite_trader
EnvironmentFile=/opt/zerodha_kite_trader/.env
ExecStart=/opt/zerodha_kite_trader/.venv/bin/python -m app.main
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

And `/etc/systemd/system/kite-dashboard.service`:

```ini
[Unit]
Description=Kite Trading Dashboard
After=network-online.target

[Service]
Type=simple
User=trader
WorkingDirectory=/opt/zerodha_kite_trader
EnvironmentFile=/opt/zerodha_kite_trader/.env
ExecStart=/opt/zerodha_kite_trader/.venv/bin/uvicorn app.api.server:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now kite-engine kite-dashboard
journalctl -u kite-engine -f
```

## Daily token automation

Kite access tokens expire each day (~6 AM IST). Either:

- run `scripts/kite_login.py` manually each morning, or
- automate the login flow (TOTP + request_token capture) and write the token to
  your secret manager before market open. Schedule it via `cron`/systemd timer
  ~08:45 IST. **Never hard-code credentials in the repo.**

## Reverse proxy + TLS (dashboard)

Put the dashboard behind nginx/Caddy with HTTPS and basic auth, and bind uvicorn
to `127.0.0.1` only (as above). Example Caddy:

```
trading.example.com {
    basicauth { admin <bcrypt-hash> }
    reverse_proxy 127.0.0.1:8000
}
```

## Observability

- Logs: `logs/trading.log` (rotating) and `logs/audit.log` (orders/trades/kill-switch).
- Metrics: `performance_metrics` table; `/api/state` for live snapshot.
- Alerts: enable Telegram for entry/exit/SL/target/risk/daily-summary.

## Pre-go-live checklist

- [ ] Ran in paper mode for several weeks; reviewed `audit.log`.
- [ ] Backtested target instruments; profit factor > 1.3 **after** charges.
- [ ] Verified position sizing risks ≤ 1% per trade on real lot sizes.
- [ ] Confirmed kill switch works (daily-loss and drawdown triggers).
- [ ] Postgres backups scheduled.
- [ ] Secrets in a vault, not in `.env` on disk where possible.
- [ ] Set `ENV=production` (disables SQLite fallback — fail loud if DB is down).
- [ ] Start with reduced capital and `MAX_OPEN_POSITIONS=1`.
