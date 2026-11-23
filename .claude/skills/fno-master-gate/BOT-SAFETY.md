# Automating this: read before a single rupee runs through a bot

The operator's own warning, verbatim in substance: *"if this thing will happen in the
bot, we will make a lot of loss and every money will be wiped out in 2 days only."*

**That warning is correct, and it is the most important sentence in this skill.**
This file exists so that it does not happen.

---

## 1. The honest starting position

**The discretionary logic in this skill has not been shown to have a positive edge.**
Its recorded results over four weeks:

| Trade | Result |
|---|---|
| INFY Oct 1180/1220 call spread | **−₹3,360** |
| HAL Nov 5100 CE (closed on a funding problem, thesis intact) | **−₹6,517.50** |
| ITC Nov 255/250 puts (chart-only, no catalyst) | **−₹6,054.75** |
| The 13 Nov book: ten longs, six banks, one expiry, on margin | **−₹27,296.25** |
| MAZDOCK Nov 1800 PE (dated, quantified catalyst) | **+₹13,815** |
| 16 Nov session | **+₹13,894.25** |
| SBIN Dec 1120 CE | **+187%** |
| MAXHEALTH (recommended booking 3×; operator held and was right) | **~₹33,810 of forgone gain** |
| Four premature exit calls, each reversing within 90 minutes | NIFTY **+₹2,795**, MAZDOCK **+₹5,287.50**, MAZDOCK **+₹14,625** |

**The operator has been right against my exit calls on five of six occasions.** A
process with that record must not be automated as-is. Automation does not improve a
strategy — it removes the human who has been catching its mistakes.

**Long option buying starts with negative expectancy.** Every position pays theta
daily, crosses the bid-ask twice, and buys implied volatility that is usually above
realised. A bot must demonstrate an edge large enough to clear all three before it
sees real money. Most do not.

---

## 2. Gate 0 — what must be true before live capital

**All five. No exceptions, no "small live test to check it works."**

1. **Backtest on out-of-sample data** the bot has never been tuned on. Report CAGR,
   max drawdown, Sharpe, win rate, **profit factor**, and expectancy per trade *after*
   brokerage, STT, stamp duty, exchange fees, GST and modelled slippage.
2. **Costs modelled honestly.** Options slippage is not one tick. Use the real spread
   from the chain scans — several strikes in this skill's own scans had spreads of
   1–2% of premium, and the DLF and ULTRACEMCO chains were wider.
3. **Paper trade for a minimum of 20 trading sessions**, live data, live timestamps,
   no retrospective edits. Compare paper results against the backtest. **A large gap
   means the backtest is wrong, not that paper was unlucky.**
4. **Expectancy must be positive in paper.** If it is not, the bot does not go live.
   No amount of capital fixes negative expectancy — it only gets to zero faster.
5. **Reconcile against the broker on every restart.** Read `get_my_trading_positions_today`
   and the margin endpoint and refuse to start if the bot's view disagrees with the
   broker's.

---

## 3. Hard limits, enforced in code, failing CLOSED

A limit that exists in a config file but is not checked on the order path is not a
limit. Each of these must block the order, and on any error must **refuse to trade**
rather than trade unchecked.

```
RISK PER TRADE          <= 1% of capital at the stop     (Rs 5,000 on Rs 5 lakh)
MAX POSITION SIZE       <= 10% of capital in one name
MAX POSITIONS OPEN      <= 4
MAX PER SECTOR          <= 2
DAILY LOSS LIMIT        -3% of capital -> flatten nothing, but NO NEW ENTRIES, all day
WEEKLY LOSS LIMIT       -6% of capital -> bot stops until a human restarts it
MAX DEBIT               0.  Premium only from clear_cash. Never from collateral
ORDERS PER DAY          <= 6            (a bot that wants 50 is broken)
ENTRY WINDOW            09:30 - 14:45   (no opening auction, no closing illiquidity)
EXPIRY-DAY ENTRIES      forbidden
NO AVERAGING DOWN       ever. Adding to a loser is not a strategy
NO NAKED SHORT OPTIONS  ever. Undefined risk is how accounts go to zero in one gap
```

### The kill switch
- Reachable **by hand, from a phone, in under ten seconds**, without the bot's cooperation.
- On trip: cancel all open orders, place no new ones, **leave existing positions alone**
  (panic-flattening into an illiquid chain is its own loss) and alert.
- Fails closed: if the switch's state cannot be read, the bot does not trade.
- Tested before go-live, and once a month after.

### Pre-trade checks on the order path
- `clear_cash` covers the premium. **`option_buy_balance_available` is not cash** — it
  is inflated by pledged collateral, and buying against it creates an
  interest-accruing debit. This has happened three times: −₹22,314 on 27 Oct,
  −₹99,332 on 13 Nov, −₹74,007 on 23 Nov.
- Spread ≤ 2% of premium, and depth at the bid ≥ 1 lot. **If you cannot model the
  exit, you cannot take the entry.**
- Instrument is not in the F&O ban list.
- No earnings or macro event inside the intended hold, unless the strategy is
  explicitly an event strategy.
- The stop is a **stock level**, stored with the position at entry.

---

## 4. What a bot must NOT be allowed to do

- **Must not place orders on Kite.** `place_order` exists there and it is a different
  broker account. Not once, not as a test.
- **Must not run the discretionary logic of this skill unchanged.** A dossier that
  needs a judgement call on "is this catalyst real" cannot be executed by code. Automate
  only the parts that are fully mechanical: the sector ranking, the headroom
  calculation, the structure gates, the SD maths, the spread and liquidity checks, the
  stop placement. **The cause (section D) and the disconfirming case (section J) are
  human fields.** A bot with no D and no J is a momentum-only system, and must be
  sized as one.
- **Must not log, print or transmit `GROWW_API_SECRET`.** It is a TOTP seed that mints
  trading sessions. Environment variables only.
- **Must not re-send an order after an uncertain response.** Read back the order
  status. A duplicate fill on an option is a real, immediate loss.
- **Must not use market orders on illiquid strikes.** On a 2% spread a market order
  pays the spread on the way in and again on the way out. (Note the opposite rule for
  *discretionary exits*, where a limit order on a falling option sat unfilled and cost
  ₹1,120 — a bot resolves this with a limit at the bid, repriced on a timer, not with
  a market order into a thin book.)
- **Must not trade a strike whose option fell on a day its underlying rose.** Encode
  this: it caught SUNPHARMA, DIVISLAB, ITC, RELIANCE, IRFC and JIOFIN in a single
  session, all of which passed the chart gates.

---

## 5. Position sizing is set by RISK, never by the size of the hole

```
lots = floor( (capital x risk_per_trade) / (per-lot loss at the stock stop) )
```

**The size of a past loss is never an input to this formula.** Doubling up to recover
a drawdown is the single most reliable way to reach zero, and it is the thing a
recovery mandate invites. With ₹5 lakh and a 1% rule, a trade risks ₹5,000 at the
stop — whether the account is up or down ₹50,000.

The arithmetic that matters: recovering a ₹1 lakh drawdown needs **positive
expectancy**, not bigger bets. Bigger bets on negative expectancy just arrive at zero
sooner. A bot sized by the hole rather than by risk is the "wiped out in 2 days"
scenario, precisely.

---

## 6. Go-live ramp

Never start at full size, however good the paper results.

```
Weeks 1-2    1 lot, smallest affordable strike, max 1 position.  Watched live.
Weeks 3-4    up to 2 positions, still 1 lot each.
Month 2      normal sizing per the 1% rule, max 4 positions, IF expectancy held.
Any month with max drawdown worse than the backtest's  ->  back to 1 lot.
Two consecutive losing weeks                           ->  stop. Human review.
```

---

## 7. Daily operator review — five minutes, non-negotiable

1. Did the bot's P&L match its own log? Any unexplained fill?
2. Did every position have a stored stock stop at entry?
3. Was any limit breached, and did the code block it or merely record it?
4. `clear_cash` — is a debit building?
5. Is live expectancy still tracking paper and backtest? **Drifting apart is the
   earliest warning you will get.** Act on it then, not after the drawdown.

---

## 8. The rule above all the others

**A working pipeline is not a profitable one.** Code that places orders correctly, logs
cleanly and never crashes can still lose every rupee, and will if its expectancy is
negative. The engineering is the easy half. The edge has to be demonstrated on data
the bot has never seen, in paper, after real costs — **before** real money, and
regardless of how confident anyone is, this file's author included.
