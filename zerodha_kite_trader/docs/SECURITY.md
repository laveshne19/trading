# Security Best Practices

Trading software holds the keys to real money. Treat it accordingly.

## Secrets

- **Never commit `.env`** or any token. `.gitignore` excludes it; verify before
  every push (`git status`).
- Prefer a secret manager (AWS Secrets Manager, Vault, Doppler) over a plaintext
  `.env` on disk. Inject secrets as environment variables at runtime.
- Kite **API secret** signs the session; treat it like a password. The daily
  **access token** is short-lived but still grants full account access while valid.
- Rotate the API secret if you suspect exposure (regenerate in the Kite dev console).

## Least privilege

- Run the engine as a non-root user (`trader`); the Docker image already does.
- Bind Postgres, Redis and uvicorn to `127.0.0.1` only. Expose just the reverse
  proxy on 443.
- Use strong, unique DB and Redis passwords. Enable `requirepass` on Redis.

## Dashboard

- Control endpoints (kill switch) require the `X-API-Key` header matching
  `DASHBOARD_API_KEY` — set a strong value, not the default `change-me`.
- Put the dashboard behind TLS + auth (Caddy/nginx basic-auth or SSO).
- The dashboard is read-mostly; never add order-placement endpoints without
  authentication and rate limiting.

## Network

- Restrict outbound traffic to Zerodha/Kite endpoints and Telegram if possible.
- Keep SSH key-only, with `fail2ban` and `ufw` enabled.
- Keep the OS and Python deps patched (`pip-audit`, `apt upgrade`).

## Operational safety (these are security controls too)

- **Kill switch**: engages automatically on daily-loss / max-drawdown breach and
  can be triggered from the dashboard. Test it.
- **DRY_RUN** gate: `DRY_RUN=true` blocks real orders even with `BROKER=kite`.
- **Position limits**: `MAX_OPEN_POSITIONS`, `RISK_PER_TRADE_PCT`,
  `MAX_DAILY_LOSS_PCT`, `MAX_DRAWDOWN_PCT` are hard caps — keep them conservative.
- **Audit log**: `logs/audit.log` records every order, fill, exit and kill-switch
  event. Ship it somewhere append-only.

## Code supply chain

- Pin dependency versions; review `requirements.txt` changes.
- Run `pip-audit` / `safety` in CI.
- Review any third-party strategy code before running it with capital.

## Incident response

1. Hit the kill switch (dashboard `POST /api/kill-switch` or stop the engine).
2. Manually flatten positions in the Kite web/app if needed.
3. Regenerate the Kite API secret and DB/Redis passwords.
4. Inspect `audit.log` and `orders`/`trades` tables for unexpected activity.

## Disclaimer

This is software, not financial advice. Bugs, outages, broker rejections, market
gaps and slippage can all cause loss. Test thoroughly in paper mode and risk only
capital you can afford to lose.
