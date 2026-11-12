# Lavesh Grow Alerts

A Google Apps Script market-watch bot for the Groww F&O book. Runs every
10 minutes during market hours, ranks sectors, verdicts each open position
HOLD or CUT, hunts laggards, and alerts by email and Telegram.

## Why it watches underlyings, not option prices

The trading mandate in `../../CLAUDE.md` says stops sit on the **underlying**
stock level, never the option price, because an option-price stop measures IV
normalisation and theta and mistakes them for the thesis failing (the MAZDOCK
1800 PE lesson, 28 Oct).

So the bot tracks the thesis variable. That is the design, not a workaround:
free data covers underlyings completely, and every rule in the mandate keys on
the underlying anyway.

## Why not Groww

Groww's Live Data APIs are a paid add-on — the free tier excludes live quotes,
LTP, OHLC and option chain. This bot therefore uses the Yahoo Finance chart
endpoint (free, no key) for daily candles and computes every indicator itself.

Consequence to be aware of: **the bot cannot see option premiums.** It reports
underlying levels, stops, sector ranking and gate results. Premiums must be
read on Groww before placing anything.

## Setup

1. sheets.google.com -> new sheet -> rename it **Lavesh Grow Alerts**
2. Extensions -> Apps Script -> delete the stub -> paste `Code.gs` -> Save
3. Reload the sheet; a **Grow Alerts** menu appears
4. `Grow Alerts > 1. Set up sheet` — builds the six tabs, seeds the position book
5. `Grow Alerts > 2. Set Telegram credentials` — see below
6. `Grow Alerts > 3. Install 10-minute trigger`

### Telegram

1. Telegram -> @BotFather -> `/newbot`, username must end in `bot`
2. Copy the token it returns
3. Message your new bot anything
4. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` and read `chat.id`
5. Paste both into the menu prompt in step 5 above

The token is stored in `PropertiesService` only — never in a cell, never in
this file, never in chat. Telegram puts the token in the URL path, so the
header-injection credential store cannot hold it; `PropertiesService` is the
correct home, per the mandate's rule on `GROWW_API_SECRET`.

## Tabs

| Tab | Contents |
|---|---|
| `Dashboard` | last run, alert count, strongest/weakest sector, per-position verdict |
| `Positions` | the live book — **edit this tab as trades change** |
| `Watchlist` | the 20-name universe with lot sizes and a big-lot flag |
| `Live` | per-symbol LTP, day %, range position, supertrend, DI, ADX, RSI |
| `Sectors` | sector ranking by average constituent day % |
| `Log` | run history, trimmed at 2,000 rows |

## The rules it enforces

Taken directly from `../../CLAUDE.md`:

- **Sector first.** Sectors are ranked before any stock is considered.
- **CUT only** on a stop breach, a supertrend flip to DOWN, or a +DI/-DI
  crossover. A winner with an unhit stop is always HOLD.
- **Puts need a sequence of LOWER lows.** Flat lows under a falling high is
  compression on support (the ITC lesson, -Rs 6,054.75), not a downtrend.
- **Big lots only** for new ideas — lot size, not share price, decides how much
  a position can make.
- **Headroom = `st_upper_band` - strike**, stated in rupees. A strike at or
  above the ceiling is rejected regardless of how strong the stock is (the
  SONACOMS 960 vs 980 lesson: same stock, same expiry, +Rs 245 against
  -Rs 1,102.50, strike placement the only difference).
- **Alerts only on change.** A bot that mails every ten minutes regardless gets
  ignored, and then the one that matters gets ignored too.

## Indicators

All computed in `Code.gs` with Wilder smoothing, from 6 months of daily candles:
supertrend(10, 3), ADX and +/-DI(14), RSI(14), Bollinger(20, 2), ATR(14).

## Limits

- Apps Script time triggers support 1/5/10/15/30-minute intervals. 10 minutes
  is set; the run self-skips outside 09:15-15:30 IST on weekdays, so it costs
  nothing overnight.
- Yahoo prices may be delayed. Treat levels as indicative and confirm on Groww.
- `UrlFetchApp` daily quota is ample: ~39 runs/day x ~40 symbols is under 1,600
  calls against a 20,000 limit.
- **READ-ONLY.** The bot places no orders and holds no broker credentials.

---

## v2 — tested, both-sided, Groww-ready

`node test.cjs` — **25 assertions, all passing**, against 86 real PNB daily
candles in `fixtures/` compared to Groww's own computed indicator values.

### What the tests found

**A real bug, in the most expensive place possible.** The v1 lower-lows check
compared only the last three lows. On TCS that read 2449.60 -> 2442.00 ->
2427.50, descending, so it would have **approved a TCS put** — while the
28 Oct floor of 2408.20 had stood untouched for two weeks. That is the ITC
trade, which cost Rs 6,054.75, reproduced in code.

Fixed: a lower low now means the prior **floor** broke, and twice, because
"one lower low is a day, two is a downtrend". The suite asserts TCS and
SONACOMS are both rejected and a genuine break is accepted.

**ADX does not match Groww and is not gated.** Ours is textbook Wilder and
reads ~32-35 where Groww reads ~45. No standard variant reproduces Groww's
figure (EMA-14 was 10-17% off, SMA-7 4-17% off, inconsistently), so rather
than fit a fudge constant to one stock it is reported as **ADX\*** and
excluded from every gate. Supertrend, Bollinger, RSI, ATR and +DI all agree
within tolerance, and the suite proves the **DI-ratio gate reaches the same
verdict on both data sources** — which is what decisions actually rest on.

### Both sides

`gateLong_()` and `gateShort_()` are separate, not mirrored, because a long
and a short are not symmetric in the data — that asymmetry is the ITC lesson.
Longs need supertrend UP, DI ratio, room below the band, and no intraday fade.
Shorts need bearish DI, a **confirmed floor break**, and a range position that
is not already bouncing off the low.

### Groww API layer (optional)

The Live Data add-on (~Rs 500/month) unlocks quotes, OHLC and the option chain
over REST. `grwToken_()` mints an access token from the TOTP seed in
PropertiesService (RFC 6238, HMAC-SHA1, implemented in `totp_()`), caches it
and re-mints on expiry, so nothing is pasted in daily.

**Endpoint paths in the `GROWW` constant must be verified against the current
API docs before use.** They are named constants for exactly that reason, and
`USE_GROWW` stays `false` until `grwPing()` passes. Yahoo remains the default
working source.

### Order placement ships DISARMED

`ARMED = false`. In that state the script computes the order and writes a
ticket to the `Tickets` tab, and sends nothing. Arming requires **both** a
menu acknowledgement and editing `ARMED = true` in the code — two deliberate
acts — and even then every order passes the kill switch (`Dashboard!B3` =
`STOP`) and the risk governor first.

Groww has no sandbox and no paper mode. Every live order is real money.

### Risk governor

Daily loss limit Rs 4,000, max 10 open positions, Rs 15,000 per trade,
Rs 60,000 total premium, big-lot floor 600, minimum headroom 1.5% of spot,
and RSI ceilings that refuse to buy a vertical chart.

### Triggers

- **1 minute** — stop check on open positions only (cheap)
- **5 minutes** — full pass: sectors, gates, chain, tickets
- **30 minutes** — news, matched against the book

All self-skip outside 09:15–15:30 IST on weekdays. Alerts de-duplicate, so one
condition mails once rather than every tick.

### It will not "trade without any loss"

No system does. Every gate here filters out bad setups; none of them
manufactures a good one. The value is consistency — the same rules applied at
10:04 and at 14:58, which is the part a human reliably fails at.
