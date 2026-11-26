# Phase 1 — Environment & Integration Audit

Compiled 2026-11-26. Everything marked VERIFIED was exercised with a real call
during the 20–26 Nov 2026 trading session and returned real account or market
data. Nothing is assumed from documentation.

---

## 1. THE FINDING THAT DECIDES THE ARCHITECTURE

### The Groww MCP is READ-ONLY. It cannot place an order.

The MCP exposes **31 tools**. Not one of them creates, modifies or cancels an
order. `get_order_details` reads an order; it does not place one.

```
calculate_equity_margin          get_greeks_for_fno_contract
calculate_fno_margin             get_greeks_for_fno_symbol
calculator                       get_historical_candlestick_patterns
curate_symbols                   get_historical_technical_indicators
fetch_curated_fno                get_ltp
fetch_etf_screener               get_mutualfund_details
fetch_fundamentals_screener      get_my_trading_positions_today
fetch_historical_candle_data     get_open_interest_analysis
fetch_ipo_details                get_order_details          <- READ
fetch_ipo_listings               get_payoff_chart_steps
fetch_market_movers_and_trending get_quotes_and_depth
fetch_stocks_fundamental_data    get_specific_stock_position
fetch_technical_screener         resolve_market_time_and_calendar
fno_mcx_contracts_search_tool    get_atm_straddle_chart
get_available_margin_details     get_budget_announcement
get_equity_portfolio_holdings
```

**Consequence:** execution must run through the **Groww REST API**
(`https://api.groww.in`), not the MCP. The existing
`sheets-trading-bot/apps-script/03_GrowwApi.gs` already implements this path
with `apiPlaceOrder`, `apiModifyOrder`, `apiCancelOrder`.

So the system has **two separate Groww channels** and they must never be
confused:

```
MCP      -> research, scanning, analysis, reconciliation reads.  CANNOT TRADE.
REST API -> order placement, modification, cancellation.         THE ONLY EXECUTION PATH.
```

A second hard constraint from `CLAUDE.md`, carried forward verbatim:

> **Kite MCP has `place_order` but is a DIFFERENT broker account. Never fire an
> order there. Not once, not as a test.**

The Kite MCP disconnected during this session. It must be excluded from the
architecture entirely — not merely unused, but unreachable from any execution
code path.

---

## 2. MCP tool capability matrix — verified by use

| Capability | Tool | Status | Evidence |
|---|---|---|---|
| Market status / calendar | `resolve_market_time_and_calendar` | **VERIFIED** | Returned `2026-11-26 Thursday 09:17 IST`, equity/fno/derivatives all `open` |
| Live positions | `get_my_trading_positions_today` | **VERIFIED** | 11 positions with realised/unrealised split |
| Funds & margin | `get_available_margin_details` | **VERIFIED** | `clear_cash`, `collateral_available`, `option_buy_balance_available` |
| Holdings | `get_equity_portfolio_holdings` | **VERIFIED** | 8 holdings with `pledge_quantity` |
| Quotes + 5-level depth | `get_quotes_and_depth` | **VERIFIED** | CASH and FNO; OHLC, day range, 52wk, OI, bid/ask ladder |
| Historical candles | `fetch_historical_candle_data` | **VERIFIED** | Daily and weekly; `segment=INDEX` works for NIFTY |
| Technical indicators | `get_historical_technical_indicators` | **VERIFIED** | supertrend, adx, atr, rsi, macd, bollinger, vwap + 10 more |
| Market movers | `fetch_market_movers_and_trending_stocks_funds` | **VERIFIED** | `TOP_GAINERS_LARGE/MID`, `VOLUME_SHOCKERS` |
| Open interest | OI fields inside `get_quotes_and_depth` | **VERIFIED** | `openInterest`, `prevOpenInterest`, `oiDayChange` |
| Technical screener | `fetch_technical_screener` | SCHEMA READ, not exercised | RSI/MACD/breakout/index/sector filters |
| LTP | `get_ltp` | **DEFECTIVE** | Returns nulls for FNO |
| Mutual funds | `get_mutualfund_details` | **BROKEN** | Returns *"GROWWMCP doesn't support mutual fund details"* |
| **Order placement** | — | **DOES NOT EXIST** | No such tool |

---

## 3. MCP defects found in live use — each one is a bot hazard

These were discovered by making real calls. Every one needs a guard in code.

### 3.1 Indices silently resolve to the wrong instrument — CRITICAL

```
get_historical_technical_indicators(["Nifty 50"], segment="CASH")
  -> returns symbol "INFY", price 1124.60     <- SILENTLY WRONG

get_historical_technical_indicators(["Nifty 50"], segment="INDEX")
  -> returns symbol "NIFTY", price 25868.75   <- correct
```

Also observed: `"Bank Nifty"` in CASH resolves to `HDFCBANK`.

**No error is raised.** A scanner that forgets `segment="INDEX"` would compute
the market regime from Infosys and never know. **Guard: assert the returned
`symbol` matches the requested instrument, on every single call.**

### 3.2 Fuzzy F&O symbol resolution returns wrong contracts — CRITICAL

```
search "tata motors cv 460 ce 29 dec"
  -> returned TMPV 430/450/420 Calls, ltp 0.05, volume 0, OI 0
     (TMPV spot is 259.75 — these are dead contracts on a different company)
```

**Guard: never trade a contract returned by fuzzy search. Resolve the exact
`trading_symbol` from the live option chain, assert underlying + strike +
expiry + right, and reject zero-OI or zero-volume contracts.**

### 3.3 Rate limiting

```
429 Too Many Requests on
  /stocks_fo_data/v1/tr_live_prices/.../ICICIBANK26DEC1600CE/latest
```

Observed after roughly 8–10 option calls in close succession. **Depth still
returned when LTP 429'd** — a usable fallback. **Guard: token-bucket limiter,
exponential backoff, and price from the depth ladder when LTP fails.**

### 3.4 Per-call instrument cap

`get_historical_technical_indicators` processes **at most 10 instruments**;
extras are dropped and reported in a `note`. A 500-stock universe needs 50
batched calls per indicator pass.

### 3.5 Stale `asof` with a live `price`

Responses carry `"asof": "2026-11-26 00:00:00"` (midnight) while `price` is
live intraday. The indicator values are computed on completed daily candles;
only `price` is current. **Guard: never treat an indicator as intraday-fresh.**

### 3.6 `segment="INDEX"` is rejected by `get_quotes_and_depth`

```
get_quotes_and_depth("Nifty 50", segment="INDEX")
  -> validation error: Input should be 'CASH' or 'FNO'
```

Index quotes must come from `fetch_historical_candle_data` with
`segment="INDEX"` instead. Two different tools, two different segment
vocabularies.

### 3.7 Index previous close is not directly exposed

`fetch_historical_candle_data` returns an in-progress candle whose `close` is
the *current* price. The previous close must be read from the preceding
candle. **This caused a real analytical error in this session** — an intraday
snapshot was compared against another snapshot and a **+1.85% up day was
reported as a selloff**. Encoded as mistake #9 in `USER_TRADING_PROFILE.md`.

---

## 4. Groww REST API — the execution path

From `00_Config.gs`, with the repo's own confidence markers:

**Documented by Groww, treated as correct:**
```
POST /v1/token/api/access        POST /v1/order/create
POST /v1/order/modify            POST /v1/order/cancel
GET  /v1/margins/detail/user     POST /v1/margins/detail/orders
```

**Unverified — the repo README flags these as best-known values:**
```
GET /v1/order/status    GET /v1/order/list      GET /v1/order/detail
GET /v1/order/trades    GET /v1/positions/user  GET /v1/holdings/user
GET /v1/live-data/ltp   GET /v1/live-data/quote GET /v1/live-data/option-chain
GET /v1/historical/candle/range
```

`diagVerifyEndpoints()` exists to probe each. **A 404 means the path is wrong.**

**Paid add-on dependency, unresolved:** Groww Live Data is a paid tier. The
free tier covers orders, positions, margins, holdings but **excludes** live
LTP/OHLC/quote, option chain and backtesting. The bot needs the option chain to
select a strike. `[REQUIRED INPUT]` — confirm the plan.

**Authentication:** TOTP via `GROWW_API_SECRET`, a base32 seed that mints
trading sessions. `CLAUDE.md` constraint: never commit it, print it, echo it
into chat, or write it into a sheet cell. It lives in Script Properties only.

---

## 5. Existing codebase — what is already built

`sheets-trading-bot/` — 15 Apps Script files, ~3,200 lines, 47 tests.

| File | Lines | Purpose |
|---|---:|---|
| `00_Config.gs` | 188 | All tunables + endpoint table |
| `01_Secrets.gs` | 94 | Script Properties credential storage |
| `02_GrowwAuth.gs` | 239 | TOTP, session minting, token refresh |
| `03_GrowwApi.gs` | 301 | REST layer incl. place/modify/cancel |
| `04_Claude.gs` | 170 | Model calls, strict-JSON parsing |
| `05_Indicators.gs` | 207 | EMA, RSI, ATR, VWAP, opening range |
| `06_Strategy.gs` | 381 | ORB, AI signal, EOD carry |
| `07_Risk.gs` | 303 | Sizing, caps, kill switch |
| `08_Orders.gs` | 372 | Placement, fill confirmation, exchange stop |
| `09_Scheduler.gs` | 304 | `jobTick()` orchestration |
| `10_SheetIO.gs` | 146 | Sheet read/write |
| `11_Menu.gs` | 124 | Menus and controls |
| `12_Setup.gs` | 153 | Sheet construction |
| `13_Notify.gs` | 37 | Email alerts |
| `14_Util.gs` | 131 | Helpers |

**Design decisions already correct and worth preserving:**
- Ships `DRY_RUN = true`.
- **Places an SL-M stop at the exchange the moment an entry fills** — so the
  stop survives the script dying. Position marked `OPEN_UNPROTECTED` if that
  fails, with re-arm on the next tick.
- Strategy proposes, risk gate sizes — deliberately separate.
- `REQUIRE_AI_CONFIRMATION`: an unreachable model means stand down, never fall
  back to rules alone.
- Test harness makes `UrlFetchApp.fetch` **throw**, so a test that would hit
  the network fails rather than passing silently.
- Buying options only. No writing.

**Gaps against the new specification:**

| Spec requirement | Status |
|---|---|
| Market-wide scanner (Nifty 500) | **MISSING** — short static watchlist only |
| Strategies B–G (breakout, momentum, VWAP reversal, mean reversion, index) | **MISSING** — ORB + AI only |
| Backtesting engine | **MISSING** |
| Opportunity scoring (10 sub-scores) | **MISSING** |
| Paper mode distinct from DRY_RUN, with slippage + cost model | **MISSING** |
| Position reconciliation vs broker | **PARTIAL** |
| Brokerage/STT/GST cost model | **MISSING** — README states logged P&L is gross |
| Sheets 5,6,7,8,9 (Strategy Perf, Risk Mgmt, Bot Settings, Journal, Market Intel) | **MISSING** — 8 sheets exist, none of these |
| Telegram notifications | **MISSING** — email only |
| Analytics / continuous improvement | **MISSING** |
| Weekly loss limit, consecutive-loss cap, sector cap | **MISSING** |

Roughly **40% of the specification already exists and works.** Rebuilding it
would be waste; the plan extends it.

---

## 6. Apps Script platform limits — measured constraints, not opinions

| Limit | Value | Consequence |
|---|---|---|
| Trigger granularity | ~1 minute, can be delayed or skipped | Cannot guarantee a 1-minute decision cycle |
| Execution cap | 6 minutes per run | A slow API call kills the run mid-sequence |
| Daily trigger runtime | ~90 min/day (consumer Google) | Can exhaust before the close |
| `UrlFetchApp` quota | ~20,000 calls/day | A 500-stock universe at 1-min cycles exceeds this |
| Streaming | None | Polling only |

**Arithmetic on the spec's own target.** A 1–2 minute cycle over a 375-minute
session = 188–375 cycles. A 500-stock universe needs ≥50 batched indicator
calls per cycle. That is **9,400–18,750 calls/day minimum** — at or beyond the
quota before any order traffic, and far beyond the 90-minute runtime budget.

**Conclusion: Apps Script cannot host the scanner.** It remains the control
interface, dashboard, configuration store, journal and alerting layer — which
is what the spec asks for in section 9. A separate backend is required for
scanning and execution. This is not a preference; it is the quota arithmetic.

---

## 7. Regulatory position — requires verification before live

`[REQUIRED INPUT]` — I have not verified current SEBI/NSE retail algo rules
against primary sources in this session. The following must be confirmed
before any live deployment, and the architecture must not assume an answer:

- SEBI's retail algo framework: registration, broker-level approval, strategy
  tagging, order-per-second thresholds.
- Whether Groww's API terms permit automated order placement for retail.
- Static IP requirements, if any.
- Exchange algo-ID tagging obligations.
- Order-rate limits at broker and exchange.

**Design rule, non-negotiable: no workarounds.** If a control blocks automated
placement, the system degrades to signal generation with manual execution. It
does not route around the control.

---

## 8. Risks this audit surfaces

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **No validated edge exists.** `BOT-SAFETY.md` says so; the one fully-audited session is 1 win in 6. | **CRITICAL** | Research → paper → live gating; ≥30 sessions; no live until forward-tested positive after costs |
| 2 | Index silently resolving to INFY/HDFCBANK | **CRITICAL** | Assert returned symbol on every call |
| 3 | Fuzzy F&O search returning dead contracts | **CRITICAL** | Exact `trading_symbol` from the live chain; reject zero-OI |
| 4 | Capital basis unresolved (Rs 52k vs Rs 209k vs Rs 100k) | **CRITICAL** | Blocks the risk engine; `[REQUIRED INPUT]` |
| 5 | Unverified REST read endpoints | HIGH | `diagVerifyEndpoints()` before each phase gate |
| 6 | Live Data add-on may not be active | HIGH | Verify; the bot cannot select a strike without the chain |
| 7 | Apps Script quota vs 1-min cycles | HIGH | Backend for scanning; Sheets for control |
| 8 | Stale lot sizes corrupting every size calc | HIGH | Scheduled NSE contract-spec pull; BANKNIFTY already disputed 30 vs 35 |
| 9 | Duplicate orders on retry | HIGH | Idempotency keys + check-before-retry, never blind retry |
| 10 | No cost model — logged P&L is gross | MEDIUM | Brokerage/STT/GST/stamp/SEBI model before any profitability claim |
| 11 | Gap risk unhedged | MEDIUM | `ENABLE_EOD_CARRY=false`; a stop does not survive a gap |
| 12 | Regulatory status unverified | MEDIUM | Section 7 before live |
| 13 | TOTP seed exposure | HIGH | Script Properties only; never a cell, commit or chat message |

---

## 9. Build plan

Phases 1–2 are deliverables of this pass. Each later phase has an explicit exit
gate; no phase starts before the previous one passes.

| Phase | Deliverable | Exit gate |
|---|---|---|
| **1. Audit** | This document + `USER_TRADING_PROFILE.md` | **DONE** |
| **2. Architecture** | Component design, data flow, security model, risk controls | Reviewed |
| **3. Market data** | Universe builder, batched scanner, MCP guards for defects 3.1–3.7, freshness validation | Scanner returns a ranked list with zero symbol-mismatch errors over a full session |
| **4. Strategies** | A–G as independently testable pure functions | Each has unit tests and a no-lookahead proof |
| **5. Risk engine** | Sizing, all caps, consecutive losses, sector cap, kill switch, reconciliation | Every limit has a test that proves it blocks |
| **6. Sheets** | Sheets 1–9, settings validation | Dashboard renders from live data |
| **7. Paper trading** | Simulated fills, slippage, full cost model | Runs a full session unattended without error |
| **8. Validation** | ≥30 sessions forward-tested | **Positive expectancy after costs.** A profitable backtest does not substitute. |
| **9. Live** | Explicit authorisation, smallest size | Every checklist item green |

---

## 10. What I will not do

- Claim a component works before it has been tested.
- Use a backtest to justify live deployment.
- Invent capital, P&L, or history. Everything in
  `USER_TRADING_PROFILE.md` carries a provenance tag.
- Place an order on the Kite MCP.
- Write the TOTP seed anywhere but Script Properties.
- Route around a broker or exchange control.
- Auto-advance to live mode.

---

*Phase 1 complete. The blocking items are: the capital basis, the Live Data
add-on, the ChatGPT history export, and the regulatory check. Phase 2 can
proceed on the first three being open; Phase 9 cannot.*
