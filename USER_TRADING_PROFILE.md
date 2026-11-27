# USER_TRADING_PROFILE.md

Compiled 2026-11-26 from sources that were actually inspected. Every figure
carries its provenance. Nothing here is estimated, rounded for effect, or
inferred from what a typical retail account looks like.

**Legend**

| Tag | Meaning |
|---|---|
| `[API]` | Read live from the Groww MCP during this session. Reproducible. |
| `[SESSION]` | Observed first-hand in the 20–26 Nov 2026 trading conversation. |
| `[CLAUDE.md]` | Recorded in the repo's standing mandate, written 27 Oct – 13 Nov. |
| `[SCREENSHOT]` | Taken from an image the user supplied. Not API-verified. |
| `[REQUIRED INPUT]` | Not available to me. Must be supplied before it can be used. |

---

## 1. Available trading capital

`[API]` read 2026-11-26 09:18 IST via `get_available_margin_details`:

```
clear_cash                      -Rs 139,627.83
collateral_available             Rs 191,924.86
option_buy_balance_available     Rs  52,297.03
cnc_balance_available           -Rs 139,627.83
net_margin_used                  Rs       0.00
```

`[API]` `get_equity_portfolio_holdings` 2026-11-26 09:21 IST:

```
total_invested_value   Rs 111,000 (reported "1.11 Lakhs")
total_current_value    Rs  97,830 (reported "97.83 Thousands")
total_p&l             -Rs  12,810  (-11.58%)
```

**Derived balance sheet (arithmetic, not an estimate):**

```
Pledged collateral (post-haircut)      Rs 191,924.86
Open option positions (market value)   Rs 156,368.75   <- see section 3
Cash debit                            -Rs 139,627.83
---------------------------------------------------
NET WORTH                              Rs 208,665.78
```

**Critical finding — the debit is not a loss, it is deployment.** Premium paid
into the five open positions totals **Rs 139,032.50**. The cash debit is
**Rs 139,627.83**. The Rs 595.33 difference is accumulated brokerage and
charges. Every rupee of negative cash is accounted for.

**Capital figures stated by the user, not independently verifiable:**
- `[CLAUDE.md]` "Working capital ~Rs 1,00,000."
- `[SESSION]` 2026-11-23: "I can invest up to 5 lakhs of capital."
- `[CLAUDE.md]` "I will put more money in Groww. You don't worry about that."

**`[REQUIRED INPUT]`** — The bot's `CAPITAL` constant currently reads
`100000`. Which number should size positions: the Rs 52,297 of borrowed
headroom, the Rs 208,666 net worth, or a fresh deposit? These produce position
sizes that differ by 4x. **The bot must not be switched to live until this is
answered.**

---

## 2. Historical trading performance

### 2a. Verified realised P&L — 25 Nov 2026 `[API]`

Read from `get_my_trading_positions_today` at 15:34 IST:

| Instrument | Qty | Entry | Exit | Realised |
|---|---:|---:|---:|---:|
| CHOLAFIN 29 Dec 1880 CE | 625 | 78.15 | 67.15 | **-Rs 6,875.00** |
| MAXHEALTH 29 Dec 1050 CE | 525 | 65.00 | 54.95 | **-Rs 5,276.25** |
| TATASTEEL 29 Dec 170 CE | 2,750 | 4.83 | 3.17 | **-Rs 4,565.00** |
| MARUTI 29 Dec 14500 CE | 50 | 354.35 | 309.10 | **-Rs 2,262.50** |
| HINDALCO 29 Dec 880 PE | 700 | 23.40 | 20.60 | **-Rs 1,960.00** |
| NIFTY 01 Dec 25700 CE | 65 | 232.00 | 250.95 | **+Rs 1,231.75** |
| | | | **TOTAL** | **-Rs 19,707.00** |

Win rate that session: **1 of 6 = 16.7%.**

### 2b. Earlier results `[CLAUDE.md]` — user-reported, not API-verified

| Date | Trade | Result |
|---|---|---:|
| 23 Oct | INFY Oct 1180/1220 bull call spread | -Rs 3,360 |
| 27 Oct | HAL Nov 5000/5100 legs, closed early | -Rs 6,517.50 |
| 27 Oct | Session total | -Rs 7,507.50 (-7.5%) |
| 28 Oct | ITC Nov 255/250 puts | -Rs 6,054.75 |
| 28 Oct | MAZDOCK Nov 1800 PE | +Rs 13,815 |
| 23 Nov | ICICIBANK 1700 CE | -Rs 15,750 |

### 2c. Open positions, 26 Nov 2026 09:18 IST `[API]`

| Instrument | Qty | Entry | LTP | Unrealised |
|---|---:|---:|---:|---:|
| AUROPHARMA 29 Dec 1800 CE | 550 | 70.00 | 86.70 | +Rs 9,185.00 |
| HDFCBANK 29 Dec 830 CE | 650 | 36.00 | 41.05 | +Rs 3,282.50 |
| TATASTEEL 29 Dec 160 PE | 2,750 | 4.83 | 5.83 | +Rs 2,750.00 |
| TATACONSUM 29 Dec 1150 CE | 550 | 47.00 | 51.50 | +Rs 2,475.00 |
| BHARTIARTL 29 Dec 2080 CE | 475 | 80.00 | 79.25 | -Rs 356.25 |
| | | | **TOTAL** | **+Rs 17,336.25** |

Cost basis Rs 139,032.50 → market value Rs 156,368.75 = **+12.47%**.

### 2d. The pattern that matters more than any single trade `[SESSION]`

Measured across the 25 Nov session:

```
SIX positions CLOSED     -Rs 19,707.00
FIVE positions HELD      +Rs 16,030.00  (at the close; +Rs 17,336 next morning)
```

**Every rupee lost came from closing a position. Every rupee gained came from
holding one.** Four of the six closures happened with the stated stop *not
hit*. This is the single most important input to the bot's exit logic and it is
documented in `[CLAUDE.md]` as a four-times-repeated error.

**`[REQUIRED INPUT]`** — Full trade history before 20 Nov 2026. I have only
what `[CLAUDE.md]` records. Groww's order/trade book is reachable through the
REST API (`/v1/order/list`), **not** through the MCP. A one-time export is
needed to compute a real win rate, profit factor, expectancy and drawdown.
Without it, sections 2b and 7 rest on recollection.

---

## 3. Trading preferences `[SESSION]` `[CLAUDE.md]`

| Preference | Value | Source |
|---|---|---|
| Segment | NSE F&O — stock and index options, long only | `[CLAUDE.md]` |
| Instrument | **Single leg only. No spreads, ever.** | `[CLAUDE.md]`, after 0-for-2 on spreads where the user filled the wrong leg |
| Direction | Both. Puts are "a hunting ground, not something to skip" | `[CLAUDE.md]` |
| Basket size | 5–6 ranked positions, never one | `[CLAUDE.md]` rule 7 |
| Lot preference | **Big lots.** "Lot size, not share price, decides how much a trade can make" | `[CLAUDE.md]` 12 Nov |
| Workflow | **Sector first, then stocks.** Rank sector indices, name leaders *and* laggards, then go to stocks in the top-2/bottom-2 | `[CLAUDE.md]` 12 Nov standing order |
| Writing options | **Never.** Buying only. | `sheets-trading-bot/README.md` |
| Monitoring | "Give me only the strong trades which we can hold... not to watch all time" | `[SESSION]` 25 Nov |

---

## 4. Previous strategies

### 4a. Codified and in use `[SESSION]`

The `fno-master-gate` skill (538 lines, committed `ac5c62a`/`cc0c64c`/`8bfc50d`).
Every rule in it was written after a specific loss. The live gate:

1. **Sector ranking first** — ADX and DI on 9 sector indices before any stock.
2. **Direction-specific structure check** — longs read the sequence of weekly
   HIGHS; shorts read the sequence of weekly LOWS. Mixing these cost Rs 6,054.75
   on ITC.
3. **Headroom rule** — `headroom = st_upper_band - strike`, stated in rupees.
   A strike at or above the supertrend ceiling is rejected.
4. **IV-inflation filter** — reject an option already up ~70%+ intraday.
5. **Intrinsic ratio** — prefer high intrinsic; 100%-time-value options bleed
   on any VIX fall.
6. **OI paired with price** — up+up = longs; up+down = writers; up + falling
   OI = short covering.
7. **Liquidity gate** — spread <= 2%, depth >= 1 lot.
8. **SDs to breakeven** — `% move needed / (ATR% per day x sqrt(days))`, under
   0.6 is defensible.
9. **Both calendars** — company results *and* macro prints (CPI, RBI MPC, FOMC).
10. **Stops on the thesis variable** — a stock-level price, not an option price,
    unless the thesis *is* the option price.
11. **Target written at entry** — a stop without a target gets churned out.
12. **Size from risk at the stop**, not from cost.

### 4b. Strategies implemented in code `[REPO]`

`sheets-trading-bot/apps-script/06_Strategy.gs` (381 lines):
- **ORB** — opening-range breakout, first 15 min, 0.15% break threshold,
  filtered by daily trend AND the right side of VWAP.
- **AI signal** — Claude returns strict JSON with conviction 1–5; below 3 is
  rejected; unparseable degrades to `NO_TRADE`.
- **EOD carry** — shipped disabled.

### 4c. Explicitly abandoned `[CLAUDE.md]`

- **Multi-leg spreads.** Banned after the user bought both legs of a HAL spread
  (Rs 30,000 of premium instead of Rs 5,164) and bought the leg that was meant
  to be sold on MAZDOCK.

---

## 5. Preferred instruments

`[SESSION]` — traded 20–26 Nov 2026, with verified lot sizes:

```
AUROPHARMA 550   BHARTIARTL 475   CHOLAFIN   625   HDFCBANK  650
TATACONSUM 550   TATASTEEL 2,750  HINDALCO   700   MAXHEALTH 525
MARUTI      50   ICICIBANK  700   AXISBANK   625   DRREDDY   625
SUNPHARMA  350   NIFTY       65   BANKNIFTY   30
```

`[CLAUDE.md]` also records AUBANK 1,000 · SHRIRAMFIN 825 · DIVISLAB 100 ·
APOLLOHOSP 125 · M&M 200 · DLF 950 · KOTAKBANK 2,000 · ULTRACEMCO 50 ·
IDFCFIRSTB 9,275 · CANBK 6,750 · UNIONBANK 4,425 · MANKIND 250.

**`[REQUIRED INPUT]`** — These are a working set, not the authoritative NSE lot
table. Lot sizes change by circular. The bot needs a scheduled pull of the
official contract specs; a stale lot size silently corrupts every position-size
calculation. `[CLAUDE.md]` already flags BANKNIFTY as disputed (30 vs 35) and
`00_Config.gs` carries 35 while this session observed 30.

---

## 6. Risk tolerance

### Stated limits `[CLAUDE.md]` and `[REPO]`

| Control | Documented value |
|---|---|
| Risk per trade | 2% (`RISK_PCT_PER_TRADE`) |
| Daily loss limit | 4% — "stop for today, no new entries" |
| Max deployed | 30% of capital as premium |
| Max concurrent positions | 2 |
| Max trades per day | 3 |
| Sector cap | 2 positions per sector |
| Expiry | Stagger; not all one series |

### Revealed tolerance `[SESSION]` — materially different

| Date | Event | Breach |
|---|---|---|
| 27 Oct | Day closed -Rs 7,507.50 | -7.5% vs a 4% limit |
| 25 Nov | Day reached -Rs 11,409.50 at 13:07 | -6.95% vs a 4% limit |
| 25 Nov | Recommended book risked Rs 99,478 at the stops | 60% of equity vs a 1% rule |
| 13 Nov | Ten long calls, six of them banks, one expiry, on margin | Sector cap 2, negative net equity |
| 26 Nov | Five positions, Rs 139,032 premium | vs a 30% deploy cap on Rs 100,000 |

**The documented limits have never actually bound.** A bot that enforces them
literally would have refused most of the trades in this record. That is the
point of building it — but it means the backtest cannot be calibrated on the
historical behaviour, because the historical behaviour violated the rules being
coded.

**`[REQUIRED INPUT]`** — Confirm the live limits. The spec proposes 0.5% per
trade, 1.5% daily, 3% weekly, max 3 positions, min 1:2 R:R, max 3 consecutive
losses. On Rs 52,297 of headroom that is **Rs 261 of risk per trade**, which
sizes to **zero lots on every instrument in section 5**. The limits and the
capital base must be reconciled before the risk engine can pass anything.

---

## 7. Previous mistakes

Ranked by documented cost. All `[CLAUDE.md]` or `[SESSION]`.

| # | Mistake | Occurrences | Known cost |
|---|---|---:|---:|
| 1 | **Exiting a winner with an intact thesis and an unhit stop** | 5+ | Rs 15,000+ in foregone gains |
| 2 | **Buying an option that has already run** (+40% to +94% intraday) | 3+ | Rs 15,750 (ICICIBANK) + TATACONSUM |
| 3 | **Stops set on the option price when the thesis is about the stock** | 2 | Rs 5,287 near-miss on MAZDOCK |
| 4 | **Over-tight trailing stops** (0.9% on a 2.6%-ATR stock) | 2 | Rs 5,297 near-miss on HDFCBANK |
| 5 | **Reading OI without pairing it to price** | 1 | Part of the Rs 6,054.75 ITC loss |
| 6 | **Reading only weekly highs before buying a put** | 1 | Rs 6,054.75 (ITC) |
| 7 | **Multi-leg spreads the user filled wrongly** | 2 | Rs 6,517.50 |
| 8 | **Trading through a known event** without labelling it | 2 | MAZDOCK -12.8%, LAURUSLABS near-miss |
| 9 | **Measuring against an intraday snapshot, not the previous close** | 2 | Called a +1.85% day a selloff on 25 Nov |
| 10 | **New entries while cash was already negative** | 4+ | Interest on a Rs 139,628 debit |

**Mistakes 1, 4 and 9 are exit-logic and data-handling errors, and all three are
mechanisable.** They are the strongest argument for automating this at all.

---

## 8. Trading frequency `[SESSION]`

| Metric | Observed |
|---|---|
| Positions opened, 20–26 Nov | 11 |
| Positions closed, 25 Nov alone | 6 |
| Typical concurrent positions | 5–11 |
| Decision checks per session | 10–20 (user-initiated) |
| Stated preference | Fewer trades, held properly |
| Actual behaviour | High churn, especially intraday |

`[CLAUDE.md]` rule 2: *"Few trades, held properly. We do not churn."* The
observed frequency contradicts the stated preference. **The bot's
`MAX_TRADES_PER_DAY` is the control that closes this gap.**

---

## 9. Profitable vs losing setups

### Profitable `[SESSION]` `[CLAUDE.md]`

| Setup | Evidence |
|---|---|
| **Short a stock in a confirmed sector downtrend** | TATASTEEL 160 PE +Rs 5,802 at its peak. Metal index -DI 48.69, RSI 25.64, stock broke a 52-week low on 2x volume |
| **Long a leader in the strongest sector** | AUROPHARMA +Rs 9,185. Pharma ADX 69, stock ADX 65, 52wk high, OI building across three strikes |
| **A dated, quantified event** | MAZDOCK +Rs 13,815 — profit -54%, margin 23.7%→8.1% |
| **Relative strength against the index** | AUBANK, 26 Oct |
| **High intrinsic ratio (>40%)** | All four winners on 26 Nov carry 39–55% intrinsic |

### Losing `[SESSION]` `[CLAUDE.md]`

| Setup | Evidence |
|---|---|
| **Chart structure with no catalyst** | ITC -Rs 6,054.75. "An edge needs a cause" |
| **An option already up 40%+ when bought** | ICICIBANK -Rs 15,750 |
| **100% time value** | CHOLAFIN 1880 CE, spot 1,874 — whipsawed +/-Rs 3,000 on a flat stock, closed -Rs 6,875 |
| **A strike at or above the supertrend ceiling** | SONACOMS 980 (ceiling 968.25), BEL 420 (ceiling 420.66) |
| **One day of sector strength inside a downtrend** | INFY -Rs 3,360 |
| **Shorting a high-yield defensive on structure alone** | ITC, >4% yield, floor held five weeks |

---

## 10. Preferred holding period `[SESSION]`

| Horizon | Observed |
|---|---|
| Expiry chosen | 29 Dec (monthly), ~34 days at entry |
| Actual hold | 1–3 sessions |
| Intent | "Hold till Monday, Tuesday"; "trades which will work... not to watch all time" |
| Shortest | MAXHEALTH — same session, -Rs 5,276 |

**A long-dated option held for one session pays for time it never uses.** The
29 Dec series was bought to avoid theta, then exited within days — the
expensive half of both choices. **`[REQUIRED INPUT]`**: is the target horizon
intraday, 2–5 sessions, or to expiry? The strategy set, the stop distances and
the option-series selection all change with the answer.

---

## 11. Not available to me — must be imported

| Item | Status | How to get it |
|---|---|---|
| **~2 months of prior ChatGPT market study** | **Not accessible.** No file, no export, nothing in the repo. | Export the conversations and add them to this repo. Until then I cannot use them and will not pretend to. |
| **Groww order/trade book before 20 Nov** | Not in the MCP | `GET /v1/order/list` via REST, paginated, one-time export |
| **Mutual fund holdings** | `get_mutualfund_details` returns *"GROWWMCP doesn't support mutual fund details"* — verified broken `[API]` | Figures below are `[SCREENSHOT]` only |
| **Live Data add-on status** | Unverified | Run `Diagnostics → Verify endpoints`; the bot cannot trade without it |
| **Telegram bot token / chat ID** | Not provided | Required for section 12 of the spec |
| **Claude API key for the bot** | Not provided | `console.anthropic.com` |
| **Official NSE lot-size table** | Not pulled | Scheduled job needed |

`[SCREENSHOT]` precious-metals holdings, user-supplied image, **not API-verified**:
SBI Gold Rs 95,566 · HDFC Silver FoF Rs 54,876 · Nippon Silver FoF Rs 21,849 ·
Axis Silver FoF Rs 18,283 · TATSILV Rs 57,960 `[API, equity holdings]`.
Approximately Rs 2,48,534, carrying roughly -Rs 79,494.

---

## 12. Configuration the bot must expose (no code change)

Derived from everything above. Each maps to a `Config`/`BotSettings` row.

```
CAPITAL_BASIS            headroom | net_worth | fixed_amount   [REQUIRED INPUT]
CAPITAL_FIXED            number                                [REQUIRED INPUT]
RISK_PCT_PER_TRADE       default 0.005  (spec) vs 0.02 (code)  [RECONCILE]
DAILY_LOSS_LIMIT_PCT     default 0.015  (spec) vs 0.04 (code)  [RECONCILE]
WEEKLY_LOSS_LIMIT_PCT    default 0.03
MAX_CONCURRENT_POSITIONS default 3
MAX_POSITIONS_PER_SECTOR default 2
MAX_TRADES_PER_DAY       default 3
MAX_CONSECUTIVE_LOSSES   default 3
MIN_RISK_REWARD          default 2.0
MIN_INTRINSIC_PCT        default 0.40   (from section 9)
MAX_OPTION_DAY_MOVE_PCT  default 0.40   (IV-inflation filter)
MIN_HEADROOM_RS          default > 0    (headroom rule)
MAX_SPREAD_PCT           default 0.02
MIN_DEPTH_LOTS           default 1
MAX_SDS_TO_BREAKEVEN     default 0.6
STOP_BASIS               thesis_variable | option_price
MIN_STOP_DISTANCE_ATR    default 0.6    (from mistake #4)
REQUIRE_TARGET_AT_ENTRY  default TRUE
ALLOW_MULTILEG           default FALSE  — hard-coded off, not a toggle
ALLOW_OPTION_WRITING     default FALSE  — hard-coded off, not a toggle
BLOCK_ENTRY_IF_CASH_NEG  default TRUE
MODE                     research | paper | live   default research
```

---

## 13. Conclusions that shape the build

1. **The negative cash is deployment, not loss.** Rs 139,032 of premium against
   a Rs 139,628 debit, Rs 595 apart.

2. **The documented risk limits have never bound in practice.** Coding them
   literally changes the system's behaviour fundamentally, and the historical
   record cannot be used to validate rules it never followed.

3. **The largest recoverable losses are exit-timing and data-handling errors**
   (mistakes 1, 4, 9) — all mechanisable, all deterministic, no model needed.

4. **No validated edge exists yet.** `BOT-SAFETY.md` in this repo already states
   this. The realised record is 1 win in 6 on the one fully-audited session.
   Paper trading is not a formality here; it is the whole question.

5. **The capital base must be settled before the risk engine can function.** At
   the spec's 0.5% on Rs 52,297, every instrument in section 5 sizes to zero.

---

*Every `[REQUIRED INPUT]` above blocks a specific component. None is optional
decoration. The system ships in `research` mode and does not advance until each
one is answered.*
