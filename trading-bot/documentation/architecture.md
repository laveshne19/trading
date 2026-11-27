# Architecture
```
Google Sheets (control + dashboards)  <--read settings / write status--  Backend service (Python, runs on your machine or VM with Groww API access)
      ^ Apps Script: validation, menus, alerts, reports                      market_data -> scanner -> strategy_engine -> scoring
      | (no secrets, no trading loop)                                        -> risk_engine -> execution_engine -> broker (Paper | Groww)
                                                                             ledger (SQLite) <-> reconcile <-> broker positions
                                                                             watchdog (kill switch / loss limits, separate process)
```
- Control plane: backend polls the Settings sheet with a read-only service account and writes dashboards. No inbound ports are opened.
  Kill switch = a Sheets cell checked every cycle, plus a local kill file, plus the watchdog.
- Data: LTP batches (up to 50 symbols per call), websocket feed for the active shortlist, candles cached; request budget kept far under limits.
- One code path for PAPER and LIVE (the Broker interface); only the adapter differs.
- BUILT and tested: config, risk, costs, ledger, execution, paper broker, reconcile, indicators. NOT BUILT: everything else (see README).
