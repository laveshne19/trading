---
name: fno-master-gate
description: >
  The master gate for every Indian F&O options trade. Runs the full sequence:
  sector ranking, direction-specific structure check, the headroom rule, IV-inflation
  filter, open-interest confirmation, event calendars, funding check, strike selection,
  stop placement on the thesis variable, and the exit rules. Use before naming ANY
  option position on NSE F&O, and before answering "should I hold or sell" on an
  open position. Every rule here was paid for with a real loss; the loss is named.
tags:
  - india
  - fno
  - options
  - risk
---

# F&O Master Gate

Run this in order. **A candidate that fails any hard gate is rejected and listed under
"what not to buy" with the reason.** Do not soften a gate because the name looks good.

---

## STAGE 0 — Clock, money, calendar (before any analysis)

```
resolve_market_time_and_calendar   -> is the market open? is today a holiday?
get_available_margin_details       -> clear_cash, collateral_available, collateral_used
get_my_trading_positions_today     -> what is already open
```

**Three facts that invalidate work done without them:**

1. **`clear_cash` is the money, not `option_buy_balance_available`.** The latter is
   inflated by pledged collateral. Option premium comes out of **cash**. Buying
   premium against zero cash creates an interest-bearing debit of the full amount.
   *Paid for:* 27 Oct, ₹39,000 of premium against ₹25,324 of cash → −₹22,314 debit.
   20 Nov, ₹73,955 against ₹102 → −₹74,007 debit.
   State the funded number **once**, as a constraint. Never as a lecture, never twice.

2. **Net equity = collateral + position value − debit.** If that is negative, the
   book cannot be liquidated to clear the debit and there is no new trade.
   *Paid for:* 13 Nov, −₹99,333 debit against ₹69,151 of positions = **negative
   ₹10,587**. Liquidating everything raised less than the debit.

3. **Expiry and holidays decide which contract is even legal.** A "hold till Tuesday"
   plan is void if Tuesday is a holiday. A monthly option bought the day before its
   own expiry is a different instrument from what the user thinks they are buying.
   Check both before naming a strike.

---

## STAGE 1 — Sector first. Always. Never stocks first.

Pull the sector indices with `segment="INDEX"` (CASH mis-resolves "Nifty 50" to INFY
and "Bank Nifty" to HDFCBANK — a silent, wrong answer):

```
NIFTY, BANKNIFTY, NIFTYIT, NIFTYPHARMA, NIFTYMETAL, NIFTYAUTO,
NIFTYFMCG, NIFTYPSUBANK, NIFTYREALTY, NIFTYENERGY
indicators: supertrend, adx, rsi, atr   interval: 1440   span: 3M
```

Rank them. **Write the ranking down. Name the leaders AND the laggards** — a falling
sector is a put hunting ground, not something to skip. Only then go to stocks inside
the top-2 and bottom-2.

*Paid for:* a whole week of saying "no downtrend exists in F&O" while scanning only
momentum names. The downtrend was sitting in NIFTY IT and was never looked at.

---

## STAGE 2 — Direction-specific structure. The two halves are NOT symmetric.

### For a LONG (call), read the sequence of weekly HIGHS
4 months of weekly candles. Lower highs = a bounce, not a trend. **A stock up 2–6% on
the day inside lower highs is never a call.**
*Paid for:* 23 Oct INFY 1180/1220 bull call spread, −₹3,360. "Fresh call longs in IT,
the only green sector" — by Monday IT was the worst sector. One day of sector strength
inside a downtrend is noise.

### For a SHORT (put), read the sequence of weekly LOWS — not the highs
This is the half that flatters the trade and gets skipped.

- **Flat or rising lows under falling highs = compression on proven support.** Never
  buy its puts. Only *lower lows* are a downtrend.
- **A fresh 52-week low that closes at or near the day's HIGH is a reversal.**
- **Measure the stock against TODAY'S LOW, not yesterday's close.** "−0.85% on the day"
  is meaningless when it is +2.0% off the low.
- **The stock reclaiming its opening price after a new low invalidates the breakdown.**
- **Never short a high-yield defensive on chart structure alone.** A >4% yield brings
  income buyers at every dip; breaking that floor needs an event.

*Paid for:* 28 Oct ITC Nov 255/250 puts, −₹6,054.75. Highs falling for four months —
true. Lows flat at 253–255 for five straight weeks — never checked. Descending triangle
on proven support. ITC closed 259.50, its exact day high, after printing a fresh
52-week low. **ITC was 298.50 by 20 Nov, +16%.** The floor held.

*Confirmed working:* 12 Nov, TCS. Highs 2,625 → 2,565 → 2,514 → 2,506 → 2,466 (clean
lower highs, supported the put). Lows 2,408 → 2,420 → 2,450 → 2,442 → 2,428 — the
28 Oct low never broken in two weeks. **No put bought.** Rule saved the money.

---

## STAGE 3 — HARD GATE: the headroom rule

```
headroom = st_upper_band - strike        (state it in rupees, every time)
```

**If headroom is small or negative, the strike is wrong no matter how good the stock
is.** The option needs the stock to exceed the level the trend model calls its ceiling.

*Paid for three times in one morning (12 Nov):*
- BEL 420 CE — ceiling 420.66 against a 420 strike. Zero headroom.
- LT 4400 CE — ceiling 4,420.03. Twenty points of room. Rejected; bought M&M 3600
  instead (ceiling 3,688.29 = 88 points, 4× the payoff for the same thesis).
- SONACOMS 980 CE — ceiling 968.25. **The strike sat above the ceiling.** Breakeven
  needed +1.9% past the stock's own trend ceiling just to begin. SONACOMS was 890.35
  by 20 Nov with its DI ratio flipped to 0.50× bearish.

**Critical refinement:** the ceiling **rises with the stock**. This rule governs
*strike selection at entry*. It does **not** condemn an open position in a stock that
is still trending — that error was made twice on PNB.

**Apply it consistently or not at all.** On 20 Nov it rejected AXISBANK (+3.98%, the
day's top gainer, 3.1% above its ceiling) and APOLLOHOSP (+5.63%, 52-week high,
Macquarie target ₹10,500, spot ₹211 above its ceiling). Rejecting the day's best
performers is what the rule is *for*.

---

## STAGE 4 — HARD GATE: is the option itself moving?

**Pull the live option chain and read the day change on the CALLS you want to buy.**
A falling call on a rising market day means the stock is not participating and the
premium is bleeding — whatever the stock's indicators say.

*Found by this gate on 20 Nov, a day Nifty was +0.99%:*
```
SUNPHARMA  1900 CE -14.8%   1920 CE -15.0%   1940 CE -15.8%   -> REJECTED
DIVISLAB  11000 CE  -5.4%  11200 CE  -7.9%  11500 CE -10.1%   -> REJECTED
ITC         290 CE  -9.3%    295 CE -10.2%    300 CE -11.7%   -> REJECTED
RELIANCE   1340 CE  -0.6%   1360/1370 flat at 0.00%           -> REJECTED
IRFC         90 CE -11.4%  (best ATR% on the board)           -> REJECTED
JIOFIN      230 CE -12.3%   240 CE -14.7%   250 CE -14.0%     -> REJECTED
```
SUNPHARMA and DIVISLAB had huge headroom and ADX 45–74. The option tape still said no.
It also separated **hospitals** (the actual move) from **drug makers** (not moving)
inside the same "strong pharma sector" reading.

---

## STAGE 5 — The IV-inflation filter (set 20 Nov)

Among candidates that pass everything else, **prefer the option that has moved LEAST
today.** A call already up 150–200% intraday carries inflated implied volatility that
deflates on the first flat session — the stock can be unchanged and the option drops
20–30%.

*The spread on one single day (20 Nov), same market, same direction:*
```
M&M        3500 CE   +8.1%   <- least inflated. Chosen as top pick.
BHARTIARTL 2100 CE  +12.1%
ICICIBANK  1620 CE  +40.2%
MAXHEALTH  1050 CE  +86.8%
APOLLOHOSP 9000 CE +139.6%
APOLLOHOSP 9500 CE +211.0%   <- the chase
```
*Paid for:* 28 Oct MAZDOCK. Spot down only 1.23%, and the **whole chain** — calls and
puts, every strike — fell 10–30% as event premium left. An option-price stop read that
as the thesis failing. It was not.

This matters most when holding over a weekend or a holiday gap.

---

## STAGE 6 — Open interest: pair it with PRICE or say nothing

**OI change alone does not tell you who initiated.**

```
OI up   + option price up    = LONG BUILDUP   (buyers)
OI up   + option price down  = WRITERS        (sellers)
OI up   + price flat         = writers, lean  (RELIANCE 20 Nov: OI +65%, price 0.00%)
OI DOWN on your own side     = holders of your side leaving -> WARNING
```

*Paid for:* 28 Oct ITC. Called 260 CE +4,871,400 "call writing, the market is capping
ITC." It closed +5,000,775 to 11.85m OI and **ITC closed at 259.50, right at that
strike.** Rising OI into a rising price is a long buildup. They were buyers and they
were right. The ambiguity was resolved in favour of the position already recommended —
confirmation bias, plainly.

Also reject on OI collapse: DLF 770 CE on 20 Nov, **OI −56.5%** (919 → 400) while the
adjacent 780 CE was +6.7%. The 780 was clean; the 770 was holders running.

---

## STAGE 7 — Both calendars. Earnings AND macro.

**Earnings:** an option held through results is an **event bet**, not a trend trade,
and must be labelled as one. Either skip until after it reports, or say plainly it is
an earnings bet sized as money that can go to zero overnight. A gap through a stop is
the normal outcome of a miss.
*Paid for:* MAZDOCK fell −12.8% intraday on 27 Oct — Q2 profit −54% to ₹344 cr against
~₹999 cr expected, margin 23.7% → 8.1%. The date was knowable in advance.
LAURUSLABS was ranked #4 in a basket the day before it reported.

**Macro:** CPI/WPI, RBI MPC, FOMC, GDP, IIP. **Name the next macro date in every
basket.** A basket of ten longs held through a known CPI date is one bet, not ten.
*Paid for:* 12 Nov, October CPI printed **6.09%** after the close — 24-month high,
first breach of the RBI's 6% ceiling in two years. The 13 Nov open gapped down, 13 of
14 sectors red, and **nine of eleven open positions went red at once.** Every earnings
date had been checked. The macro calendar had not.

---

## STAGE 8 — Position economics

**Lot size, not share price, decides what a trade can earn.** Rank by
`lot_qty × premium` and by what ₹1 on the option is worth.
```
LT      Rs 4,186/share, lot 175   -> 4400 CE cost Rs 2,599   (Rs 1 = Rs 175)
SONACOMS  Rs 929/share, lot 1,225 -> 980 CE cost Rs 8,024    (Rs 1 = Rs 1,225)
```
The ₹929 stock was the bigger position. "Big stock" does not mean "big money at work."
Prefer PNB 8,000 / IDFCFIRSTB 9,275 / CANBK 6,750 / IRFC 5,425 / UNIONBANK 4,425 class
over 50–200 lots where even a 5× barely registers.

**Split every premium into intrinsic and time value.**
```
intrinsic = max(0, spot - strike)       cannot decay
time value = premium - intrinsic        decays every day, to zero at expiry
```
A position at 86% intrinsic is safe to hold. A position at 100% time value burning
17%/day is not. **Theta as a % of position value per day is the cleanest hold/cut
metric.** Over a gap, intrinsic is the real defence — not the stop.

**Recovery maths: use delta, not expiry breakeven.** Required move to recover a loss is
`loss / (delta × lot)`, far smaller than `strike + premium`. Quoting expiry breakeven
as the recovery number overstates it badly — stated "+2.7% to +6.1%" when the real
delta-based numbers were +0.32% and +0.47%.

---

## STAGE 9 — Structure the basket

- **Deliver 5–6 ranked candidates with instrument, entry, stop, target, cost and max
  loss in rupees, plus a one-line reason** — then name the top pick. A basket and
  committing are not in conflict: name the best one, don't hide the rest. Fill risk is
  real: a ₹100 option can be ₹130 before the order goes in. (ICICIBANK 1620 CE went
  52.95 → 56.05 in two hours on 20 Nov.)
- **Cap one sector at 2 positions. Stagger expiries. Include cheap-lot names** so
  something is always affordable.
- **A basket is only a basket if the names can disagree.** Listing eight is useful;
  buying eight is not diversification.
- **State total cost against buying power.** If the basket costs 2.9× the funds, say
  so and say which 3 fit.

*Paid for:* 13 Nov. Ten long calls, all one direction, **six of them banks**, all
23 Nov expiry, funded with debt. One rate print hit all six. Realised −₹27,296.25.

### NEVER a multi-leg spread. Single leg, one order.
Written as `BUY <symbol> <strike> <CE/PE> @ <price>`, with the stop as a rupee figure
and the lot count. Size the single leg to the risk budget instead of relying on a short
leg to cut cost. If a single leg is unaffordable, go further OTM or pick another name.
*Paid for:* HAL Nov 5000/5100 — the user bought BOTH legs. Premium out ₹30,000 instead
of ₹5,164, net delta 0.726 instead of 0.094. MAZDOCK Nov 1900/1800 — the user bought
the 1800 PE, the leg designated SELL, ending up on the wrong side of the trade.

### Lottery tickets are a separate instrument class — label them
A cheap far-OTM option ("0 to hero") **breaks the headroom rule by design**. That is
allowed only if it is labelled a lottery ticket, sized as money that can go to zero,
and justified with the distance maths:
```
39-day expected range  ~=  ATR%/day  x  sqrt(days)
SDs needed             =   % move to breakeven  /  that range
```
Under ~0.6 SD is defensible. State the honest odds — "roughly 35–50% chance of
finishing above breakeven, otherwise the whole premium goes" — and never imply more.
Do not mix these with core positions without saying which is which.

---

## STAGE 10 — The stop goes on the THESIS VARIABLE

**If the thesis is about the STOCK, the stop is a STOCK LEVEL.** An option-price stop
on a stock thesis measures IV normalisation and theta and mistakes them for the thesis
failing. Option-price stops are correct only when the thesis *is* the option price
(a premium-decay or volatility trade).

Practical levels, in order of preference: **today's low** (the day's buyers lost
control), **today's open** (the move was given back), **spot − 1 ATR** (these three
usually coincide), **the supertrend lower band** (hard trend invalidation).

**Always set a target at entry.** A position with a thesis stop and no target gets
churned out by its own trailing stop.

*Paid for:* 28 Oct MAZDOCK. The stop was trailed to ₹100 while the option traded ₹119 —
a 16% trail on an instrument whose day range was 85.65 to 133.45. It printed 95.50 on a
bounce and a sell was issued. The user refused. Thirty minutes later: ₹105.00, +₹14,625.
**A badly measured stop obeyed precisely is still a bad exit.**

---

## STAGE 11 — Exits. The most expensive habit, four times over.

**On an open position there are exactly two questions:**
```
1. Has the STOCK stop been hit?
2. Has the thesis broken?
```
**If both are no, the answer is HOLD. Move the stop up. Say nothing else.**

Do **not** model. Do **not** compute exit probabilities. "My model says the odds have
turned" is not a legitimate exit. The only legitimate exits are: **stop hit, thesis
broken, or a pre-committed target reached.**

*Paid for, four times:*
- **23 Oct** — told the user to cut NIFTY 22700 CE at −₹299. Seventeen minutes later:
  **+₹2,795.**
- **27 Oct** — told the user to sell the HAL 5100 CE leg while simultaneously saying
  HAL's thesis was intact (spot 4,854 against an invalidation of 4,640). The real
  problem was **funding**, not the trade. The user closed both legs. **−₹6,517.50 on a
  position whose thesis was still believed.**
- **28 Oct, 09:53** — MAZDOCK 1800 PE at ₹88.60 (day's low ₹85.65). Ran a Black-76
  model, computed a 60.3% probability holding would underperform, recommended selling.
  By 11:32: **₹112.10.** Selling would have cost **₹5,287.50**. The stop was ₹26. The
  thesis (−54% profit, margin collapse) was intact. **Sophisticated maths pointed at
  the wrong question is still the wrong answer.**
- **28 Oct, 14:04** — same position, told the user to sell at ₹95.50 on a stop set
  ninety minutes earlier. Position was +163%, thesis intact, stock 67 points below the
  named invalidation. The user pushed back and sent the chain showing calls **and** puts
  both down 10–30% — pure IV collapse. By 14:37: **₹105.00, +₹14,625.**
- **17 Nov** — recommended booking MAXHEALTH three times. The user held. **Cost of
  being right-sounding: ~₹33,810.**

**The user has caught this on five of six occasions. When they say a position is still
trending and the recommendation is sell, the base rate says they are right.**

### Corollaries
- **A funding shortfall is never a reason to close a position with an intact thesis.**
  Present it as the choice it is — add funds and hold, or reduce and accept the cost —
  and let the user decide. Do not issue a sell.
- **Never give a partial-exit instruction without stating explicitly what must stay
  open.** Telling someone to sell one leg of a position they are confused about invites
  them to close all of it. Expect that.
- **When the day's loss passes 4% of capital, say "stop for today" and give no new
  entries.**
- **A missing candle is not a missing move.** Check the settlement price before
  contradicting the user. (Swiggy 185 PE: `prev_close 0.05 → ltp 9.35 = +18,600%` was
  correct; the contract simply traded zero volume that day.)

---

## STAGE 12 — Gaps

**A stock-level stop does not work across a weekend or a holiday gap.** If the gap
opens beyond the stop, the stop is already blown through and the stated max loss is a
floor, not a ceiling. Say this plainly rather than implying the stop protects them.

What actually defends a position across a gap: **intrinsic value**, **low IV inflation
at entry**, and **a sector unconnected to the shock**.

*Confirmed 20–23 Nov:* Nasdaq −5.28%, Nasdaq-100 within 49 points of a bear market,
S&P in correction, NVIDIA −14% on an SEC accounting probe, Bitcoin touching $55,100 —
and **GIFT Nifty opened Monday +0.58%.** India owns no semiconductors, so AI
deleveraging rotated *into* Indian financials. Trace the transmission chain; the
relation is sometimes inverse.

---

## Hard constraints — never violate

- **Groww MCP is READ-ONLY.** There is no order-placement tool. Give trades; the user
  places them.
- **Kite MCP has `place_order` but is a DIFFERENT broker account.** Never fire an order
  there. Not once, not as a test.
- **`GROWW_API_SECRET` is a TOTP seed that mints trading sessions.** Never commit it,
  print it, echo it into chat, or write it into a spreadsheet cell.
- **Groww Live Data APIs are a paid add-on.** The free tier excludes live quotes, LTP,
  OHLC, option chain and backtesting.
- **Use MARKET orders for exits.** A limit order on a falling option sits unfilled —
  "SELL PNB 150 CE @ 1.33 limit" never filled as it went to 1.19. Cost: ₹1,120.

## API notes that silently produce wrong answers

- Indices **require `segment="INDEX"`**. In CASH, "Nifty 50" resolves to INFY and
  "Bank Nifty" resolves to HDFCBANK, returning plausible, wrong numbers.
- `get_ltp` returns nulls for FNO — use `get_quotes_and_depth` with
  `entity_type="fno"`. Depth still returns when LTP rate-limits.
- `get_mutualfund_details` is unsupported on this connector.
- "Macrotech Developers" mis-resolves to IRB.
- Infer lot size from the **depth book quantities** (all multiples of the lot), not
  from memory. KOTAKBANK reads 2,000; DLF 950; IDFCFIRSTB 9,275.
- `get_historical_technical_indicators` takes at most 10 instruments per call.

## Mandate

State the trade, strike, entry, stop, target and size. No menus, no "you could
consider". **If conviction is absent, "no trade today" is a real answer and often the
right one.** Few trades, held properly — a position is entered on a thesis and held
until the thesis breaks or the target hits. Never flip direction on intraday noise.
**Own the losses out loud**: name what was misread and do not bury it. Track record
matters more than looking right.
