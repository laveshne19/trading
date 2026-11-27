# AI Trading Bot — Google Sheets + Groww + Claude

A trading desk inside a Google Sheet. Apps Script authenticates to Groww
(TOTP, no daily paste), pulls candles and option chains, asks Claude for a
directional read, sizes the position against a fixed risk budget, places the
order, and puts a protective stop **at the broker**. Every decision, order and
fill lands in a sheet you can audit.

Sized for ₹1,00,000 of capital. Ships in `DRY_RUN` mode: it logs orders and
sends nothing.

---

## Read this before anything else

**Google Apps Script is not a real-time trading host, and pretending otherwise
is how accounts get hurt.** Concretely:

| Constraint | Consequence |
|---|---|
| Triggers fire at ~1-minute granularity and can be delayed or skipped | A price can move through your level between ticks |
| 6-minute cap per execution | A slow API call can kill a run mid-sequence |
| ~90 min/day total trigger runtime (consumer Google account) | The bot can run out of runtime before the close |
| No websockets | Prices are polled, never streamed |
| `UrlFetchApp` quota ~20,000 calls/day | A long watchlist burns it fast |

So this design does **not** rely on the script to protect you. The moment an
entry fills, an **SL-M stop order is placed on the exchange**. If the script
dies, the trigger is skipped, or your laptop is shut, the stop is still sitting
at the broker. The script's own monitoring handles targets and trailing only —
it is the second layer, never the first.

`PLACE_EXCHANGE_STOP` must stay `TRUE` in live mode. The risk gate refuses to
trade live without it. If the stop fails to place, the position is marked
`OPEN_UNPROTECTED`, you get an alert, and the next tick tries to re-arm it.

**What a stop cannot do:** protect you across a close. An overnight gap opens
straight through a stop trigger. That is why `ENABLE_EOD_CARRY` ships `FALSE`.

---

## Two things you must verify before going live

1. **Groww Live Data is a paid add-on.** The free API tier covers orders,
   positions, margins and holdings, but **excludes** live LTP/OHLC/quote,
   option chain and backtesting. This bot needs the option chain to pick a
   strike and LTP to monitor. Without the add-on, `Verify endpoints` will show
   401/403 on the live-data rows and the bot cannot trade. Check your plan
   first.

2. **Some REST paths are unverified.** Groww publicly documents
   `/v1/order/create`, `/v1/order/modify`, `/v1/order/cancel`,
   `/v1/margins/detail/user` and `/v1/margins/detail/orders`. Those are
   correct here. The read paths (positions, order status, live data, candles)
   are my best-known values. Run **Diagnostics → Verify endpoints**: it probes
   each one and tells you exactly which to correct. Fix them in the `GROWW`
   object in `00_Config.gs`. A 404 means the path is wrong.

Also check `LOT_SIZE` in Config against the current NSE contract specs, and
`EXPIRY_WEEKDAY` in `06_Strategy.gs` — NSE has moved expiry day more than once
(Thursday → Wednesday → Tuesday), and that single constant decides whether the
bot thinks today is expiry.

---

## Install

1. Create a new Google Sheet.
2. **Extensions → Apps Script.**
3. Delete the stub `Code.gs`. Add one file per `.gs` in `apps-script/` and
   paste the contents, keeping the filenames (the numeric prefixes keep them in
   a readable order; Apps Script hoists functions across files, so load order
   does not matter).
4. **Project Settings → Show "appsscript.json"**, then paste in
   `apps-script/appsscript.json`.
5. Reload the spreadsheet. A **Trading Bot** menu appears.
6. `Trading Bot → Setup → 1. Build sheets`
7. `Trading Bot → Setup → 2. Set credentials`
   - Groww API key
   - Groww API secret — the **base32 TOTP seed** (e.g. `JBSWY3DPEHPK3PXP`), not
     a password and not a 6-digit code
   - Claude API key from `console.anthropic.com`
8. `Trading Bot → Diagnostics → Run all self-tests` — expect TOTP 5/5,
   indicators 7/7, risk pass.
9. `Trading Bot → Diagnostics → Test Groww auth`
10. `Trading Bot → Diagnostics → Verify endpoints` — fix any 404s.
11. `Trading Bot → Diagnostics → Test Claude`
12. Check `LOT_SIZE` in the `Config` sheet.
13. `Trading Bot → Setup → 3. Install scheduler`

Leave `DRY_RUN = TRUE` and watch it for a full week.

### Credentials are never stored in a cell

They live in Script Properties, which a sheet viewer or editor cannot read.
The Groww secret is a TOTP seed — it mints trading sessions. Anyone who gets it
can trade your account. Never put it in a cell, a commit, or a chat message.

---

## How a trade happens

```
every 5 minutes  ->  jobTick()
                       |
                       |-- monitorPositions_()      manage what is open FIRST
                       |
                       |-- buildMarketSnapshot_()   indices, watchlist, account
                       |     daily candles -> EMA20/50, RSI, ATR, trend
                       |     5-min candles -> VWAP, opening range, day range
                       |
                       |-- strategyORB_()           rule candidate
                       |-- claudeSignal_()          independent model view
                       |     both must agree (REQUIRE_AI_CONFIRMATION)
                       |
                       |-- resolveOption_()         strike from the LIVE chain
                       |                            (exact trading_symbol, never
                       |                             a guessed symbol format)
                       |-- riskGate_()              lots, or a refusal with reasons
                       |
                       |-- LIMIT buy -> confirm fill -> SL-M stop AT THE BROKER
                       |-- write Positions row
```

The strategy proposes. The risk gate decides size. They are separate on
purpose: a model that is wrong should cost one stop, never the account.

---

## Risk model, with ₹1,00,000

| Control | Default | On ₹1,00,000 |
|---|---|---|
| `RISK_PCT_PER_TRADE` | 2% | ₹2,000 max loss per trade |
| `DAILY_LOSS_LIMIT_PCT` | 4% | ₹4,000 realised → kill switch for the day |
| `MAX_DEPLOYED_PCT` | 30% | ₹30,000 premium outstanding, max |
| `MAX_CONCURRENT_POSITIONS` | 2 | |
| `MAX_TRADES_PER_DAY` | 3 | stops revenge-trading |
| `STOP_PCT` | 35% | exit at −35% of premium |
| `TARGET_PCT` | 60% | book at +60% |

Worked example — a ₹20 Nifty option, lot 75:

```
cost per lot    20 x 75          = Rs 1,500
risk per lot    1,500 x 0.35     = Rs   525
lots by risk    2,000 / 525      = 3
lots by deploy  30,000 / 1,500   = 20
            ->  3 lots, 225 qty, Rs 4,500 deployed, Rs 1,575 at risk
```

A ₹150 option sizes to **zero** lots: one lot would risk ₹3,937 against a
₹2,000 cap. The gate refuses rather than quietly breaking the budget — this is
tested (`sizing is capped by MAX_DEPLOYED_PCT when premium is large`).

**Buying options only.** No naked writing, ever — the margin and the tail risk
do not belong on ₹1 lakh.

---

## Strategies

**`ENABLE_ORB`** — opening-range breakout. Builds the first 15 minutes, takes
the first break that clears the range by 0.15%, but **only with the daily trend
and only on the right side of VWAP**. Those two filters are the edge; without
them this buys every false break. Intraday, flat by 15:15.

**`ENABLE_AI_SIGNAL`** — Claude gets the snapshot and returns strict JSON:
decision, conviction 1–5, horizon, thesis, invalidation, risk flags. The system
prompt tells it that `NO_TRADE` is a correct and frequent answer, and that an
edge needs a *cause* — not "it is oversold" and not "it gapped so it will fill".
Conviction below 3 is rejected by the gate. An unparseable reply degrades to
`NO_TRADE`, never to a trade.

**`ENABLE_EOD_CARRY`** — off by default. Buys slightly ITM in the next series
at 15:10 when the index closes in the top/bottom quarter of its range with the
trend. Paper-run it for a month: your stop does not survive a gap.

### Models

| Setting | Default | Why |
|---|---|---|
| `MODEL_STRATEGIC` | `claude-opus-5-5` | pre-open read and trade origination — few calls, highest value |
| `MODEL_INTRADAY` | `claude-sonnet-5-5` | intraday confirmation — frequent, much cheaper |

Roughly 15–25 model calls a session. If Claude is unreachable while
`REQUIRE_AI_CONFIRMATION` is on, the bot **stands down** rather than silently
falling back to rules alone.

---

## Sheets

| Sheet | What it holds |
|---|---|
| `Dashboard` | mode, kill switch, open positions, deployed, P&L |
| `Config` | every tunable, with a note per row — edit while the market is open |
| `Watchlist` | what to scan; seeded with a crude-transmission basket |
| `Signals` | every signal considered, including the ones dropped and why |
| `Orders` | every order with its Groww id and reference id |
| `Positions` | live positions with stop, target, peak, stop order id |
| `TradeLog` | closed trades with P&L — the record you learn from |
| `AuditLog` | every auth, order, block and error |

The seeded watchlist is one shock with opposite effects: crude up helps
upstream (ONGC, OIL) and hurts OMC marketing margins (BPCL, HPCL, IOC),
aviation fuel (INDIGO, ~40% of opex) and crude-derivative inputs (ASIANPAINT,
APOLLOTYRE, PIDILITIND).

---

## Controls

- **Get a signal now** — a read with no order.
- **Scan and trade now** — one full cycle, with a confirmation dialog.
- **Halt trading today** — kill switch. Open positions are still managed.
- **PANIC: flatten everything** — cancels all orders, market-sells everything.

---

## Tests

```bash
node test/harness.cjs
```

Runs the Apps Script logic under Node with the Google globals stubbed —
`UrlFetchApp.fetch` **throws**, so any test that would hit the network fails
rather than silently passing. 47 tests: TOTP against all five RFC 6238
vectors, indicator maths and no-lookahead, position sizing and its caps, signal
parsing including malformed replies, order validation, expiry selection, the
ORB filters, and the kill switch.

---

## Honest limitations

- **Polling, not streaming.** Between two 5-minute ticks you are relying on the
  exchange stop. That is the design, but it means fills can be worse than the
  level the logic saw.
- **Gap risk is unhedged.** No stop survives a gap. Carry is off by default.
- **Apps Script quota.** A consumer Google account can run out of trigger
  runtime on a busy day. Keep the watchlist short. A Workspace account gets
  more.
- **No slippage or cost model in sizing.** Brokerage, STT, exchange fees and
  GST are real on F&O and are not deducted from the `TradeLog` P&L. Treat
  logged P&L as gross.
- **Partial fills** are treated as a full position at the filled quantity. The
  stop is placed for that quantity, which is correct, but the intended size was
  not achieved.
- **Unverified read endpoints.** See above.
- **The model can be confidently wrong.** `REQUIRE_AI_CONFIRMATION` makes two
  independent reasons necessary, the conviction floor rejects weak calls, and
  the risk gate caps the damage. None of that makes it right.

## Go-live checklist

- [ ] All self-tests pass
- [ ] Groww auth works
- [ ] `Verify endpoints` fully green
- [ ] Live Data add-on confirmed active on your plan
- [ ] `LOT_SIZE` checked against NSE contract specs
- [ ] `EXPIRY_WEEKDAY` checked against the NSE circular
- [ ] `NSE_HOLIDAYS` updated for the year
- [ ] One full week observed in `DRY_RUN` with signals that make sense
- [ ] `PLACE_EXCHANGE_STOP` is `TRUE`
- [ ] You have watched a stop actually trigger at the broker, once
- [ ] Alerts arrive (check the `UNPROTECTED` path specifically)
- [ ] Then, and only then: `DRY_RUN = FALSE`, with `MAX_TRADES_PER_DAY = 1`
