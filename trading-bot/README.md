# Groww algo trading platform (work in progress)
Safety first: nothing here trades real money, and nothing is claimed to work unless a test proves it.

## Status
| Component | Status |
|---|---|
| Config validation, LIVE gate | BUILT, 37 unit tests pass |
| Risk engine, position sizing, loss/consecutive/weekly locks | BUILT, tested |
| Cost model (STT per Budget 2026-27) | BUILT, hand-checked; rates need verifying against your contract note |
| Execution ledger, idempotency, execution state machine, stop management, kill, reconcile | BUILT, tested against a simulated broker only |
| Indicators: EMA, RSI, ATR, VWAP | BUILT, tested. MACD, ADX, Supertrend, Bollinger: NOT BUILT |
| Market data layer, scanner, strategies A-H, scoring, backtester, analytics, notifications, watchdog | NOT BUILT |
| Google Sheets dashboard + Apps Script | NOT BUILT (cannot be deployed from the build environment) |
| Groww live adapter (`growwapi`) | NOT BUILT: cannot be tested where this was built. Must pass the same contract tests first |
| Telegram | NOT BUILT (blocked in build environment) |

## Run the tests
`cd trading-bot && PYTHONPATH=backend python3 -m unittest discover -s tests -v`

Private files: USER_TRADING_PROFILE.md is git-ignored. See documentation/ for audit, architecture, risk policy, regulations.
