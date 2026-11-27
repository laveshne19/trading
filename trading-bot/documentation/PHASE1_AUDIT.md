# Phase 1: Account and environment audit

Personal account facts (balances, positions, history, file names) are deliberately NOT recorded here. They live in the
git-ignored USER_TRADING_PROFILE.md.

## 1. Groww MCP: what it can and cannot do
| Capability | Available in the build environment? |
|---|---|
| Live quotes / LTP | YES (`get_ltp` up to 50 symbols; HTTP 429 seen under load) |
| Market depth | YES (5 levels, up to 3 symbols) |
| Historical candles | YES (1-min to 90 days, daily 5 yrs, weekly 20 yrs) + server-side indicators (10 symbols/call) |
| Holdings, positions, funds, margin | YES (read-only) + margin calculators (CASH, F&O) |
| F&O contracts, OI, Greeks, straddle | YES |
| Market status / holidays | YES |
| **Order placement / modification / cancellation** | **NO** |
| **Order book / trade book (list)** | **NO** (only `get_order_details` by known id) |
| **Stop-loss / GTT orders** | **NO** |
Conclusion: the MCP is a research and monitoring tool. Live execution needs the official Groww Trade API (`growwapi`).

## 2. Environment limits
- `api.groww.in`, Telegram and NSE sites are NOT reachable from the build container (proxy-blocked); PyPI and Google endpoints are.
  A live broker adapter and Telegram alerts therefore cannot be built AND tested there.
- Python 3.13, pandas, numpy. No Postgres server, no pytest (tests use unittest).
- No Sheets API / Apps Script deployment tool is available, so Apps Script must be installed by the owner.
- The bot must run where Groww API access works (owner's machine or a cloud VM). Groww API/static-IP rules still to be verified.

## 3. Security requirement
Broker tokens, API keys/secrets, TOTP secrets and any third-party keys must never be stored in Google Sheets. Credentials found in plain
text anywhere must be revoked and regenerated. This project keeps secrets only in environment variables or a secret manager.
Any third-party or licensed bot code that can read broker tokens should be treated as untrusted. Before a new bot goes live, confirm
no other automation is trading the same account (two systems on one account can double-trade).

## 4. Financial risks
- Base rates: SEBI's published studies of individual F&O traders found about 9 in 10 lost money (from memory; verify the latest).
  Retail intraday automation is not exempt.
- Costs: STT on option premium is 0.15% and on futures 0.05% from 1 Apr 2026 (Union Budget 2026-27); modelled in costs.py.
- Confidence scores are not probabilities and are never presented as such. LIVE stays gated behind 30 paper sessions.

## 5. Technical limits
Apps Script (6-minute executions, trigger quotas) cannot run a reliable 60-second trading loop; it is for config, dashboards and alerts only.
Rate limits are per category (see regulatory_notes.md). 1-minute history is capped at 90 days, so deep intraday backtests need data
accumulated over time or from a vendor.
