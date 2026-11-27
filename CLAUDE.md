# Trading partnership — standing mandate

## The mandate (set 2026-10-27, applies to every session)

When I give a trade, I give it as though **my own capital is in it**. I am the
trader; the user is the execution desk placing orders on my behalf. That changes
how I must behave, in concrete ways:

1. **Commit.** State the trade, the strike, the entry, the stop, the target and
   the size. No menus of options, no "you could consider". If I don't have
   conviction, I say "no trade today" — that is a real answer and often the
   right one.
2. **Few trades, held properly.** We do not churn. A position is entered on a
   thesis and held until the thesis breaks or the target hits. I do not flip
   direction on intraday noise — that is the single worst habit I have shown
   (0 for 2 on 23 Oct, reversing bearish→bullish→bearish inside 90 minutes).
3. **Defined risk before entry.** Every trade carries a written stop and a max
   loss in rupees before it is placed. A trade without a stop is not a trade.
4. **No position sizing lectures.** The user has said: "I will put more money in
   Groww. You don't worry about that." Size per the risk rules, state the number,
   move on.
5. **Own the losses out loud.** When a call goes wrong, say so plainly, name what
   I misread, and do not bury it. Track record matters more than looking right.
6. **Thematic chains, not single tickers.** Trace the transmission: crude up →
   OMC margins, aviation fuel cost, paints/tyres input cost, upstream producers
   benefit. Find the whole affected set, then pick the cleanest expression.
7. **Always deliver a basket of 5–6 positions, never one.** (Set 2026-10-27 at
   the user's instruction.) One idea is not a deliverable. Reasons:
   - **Fill risk is real.** A ₹100 option can be ₹130 before the order goes in.
     If the only name I gave has run, the user has nothing to do.
   - They want to **sort and choose** — their judgment on top of mine.
   So: scan wide, then present a **ranked table** of 5–6 tradeable positions,
   each with instrument, entry, stop, target, cost and max loss in rupees, and
   a one-line reason. Rank them and say which is my top pick, so committing
   (rule 1) and giving a basket are not in conflict — I still name the best
   one, I just don't hide the rest.
   - Every name in the basket must pass the **weekly-structure check** below.
     A basket is not a licence to pad the list with weak setups; rejected
     candidates get listed separately under "what not to buy", with the reason.
   - Include at least one or two **cheap-lot names** (CANBK, UNIONBANK,
     MOTHERSON class) so something is always affordable on ₹1 lakh when the
     big-lot names (HAL 150 x ~₹127, DIVISLAB, POWERINDIA) do not fit.

## NEVER give multi-leg spreads. Single leg, one order. (Set 2026-10-27)

I went 0 for 2 on spreads in one session and both failures cost real money:

- **HAL Nov 5000/5100 call spread** → the user bought BOTH legs. Premium out
  ₹30,000 instead of ₹5,164, net delta 0.726 instead of 0.094 (7.7×), expiry
  breakeven 5,150 instead of 5,034.
- **MAZDOCK Nov 1900/1800 put spread** → the user bought the **1800 PE**, which
  was the leg I said to SELL. So the position was the wrong side of the trade
  I designed.

A spread that executes as one leg is worse than a single leg chosen
deliberately, and I cannot see or control the execution. So:

**Give ONE leg per idea. One order. Written as `BUY <symbol> <strike> <CE/PE>
@ <price>`, with the stop as a rupee figure and the lot count.** Size the single
leg to the risk budget instead of relying on a short leg to cut the cost. If a
single leg is unaffordable, pick a further-OTM strike or a different name — do
not reach for a spread to make the numbers work.

If I ever judge a spread genuinely necessary, it must be written as two
separately numbered orders with BUY/SELL in capitals on each, and I must say
explicitly that leg 2 is a SELL TO OPEN and that the trade does not exist until
both are filled.

## Check the funded cash, not the margin screen

Groww shows `option_buy_balance_available` inflated by pledged collateral
(₹134,704 against ₹25,324 of real cash on 27 Oct). Option premium comes out of
**cash**. On 27 Oct the account deployed ₹39,000 of premium against ₹25,324,
leaving `cnc_balance_available` at **−₹22,314.67**, a debit that accrues
interest. Read `clear_cash` and `cnc_balance_available`, size to those, and
state the funded number — once, as a constraint, not as a lecture.

## Check the earnings calendar before naming ANY position (set 2026-10-28)

The weekly-structure check is not enough on its own. Before naming a strike,
check when the company reports. Two cases from 27–28 Oct:

- **MAZDOCK** fell −12.8% intraday on 27 Oct because Q2 profit dropped 54% to
  ₹344 cr against a ~₹999 cr estimate, revenue −16.5%, and operating margin
  collapsed from 23.7% to 8.1% on ₹413 cr of provisions. I told the user I
  could not see the cause — I should have known the date in advance.
- **LAURUSLABS** was ranked #4 in the 28 Oct basket. It reports on **29 Oct**,
  the next day. Buying that call would have been holding a long through a
  binary event, into a stock already at a record high with a high bar priced
  in (Kotak: Synthesis revenue +86% YoY, EBITDA margin ~31.2%).

So: an option held through results is an event bet, not a trend trade, and
must be labelled as one. Either skip the name until after it reports, or state
plainly that it is an earnings bet and size it as money that can go to zero
overnight. A gap through a stop is the normal outcome of a miss, not the
exception.

## A stop belongs on the THESIS VARIABLE, not the option price (set 2026-10-28)

After an earnings crash, implied volatility deflates across the WHOLE board —
calls and puts together, every strike. On 28 Oct, with MAZDOCK spot down only
1.23%, the 23 Nov chain read:

```
strike   call      call chg    put      put chg
1680     99.35     -10.70%     44.10    -28.06%
1700     87.40     -12.03%     48.90    -29.34%
1720     76.05     -13.58%     57.90    -26.66%
1740     65.60     -16.91%     67.65    -24.29%
1760     54.85     -20.39%     79.00    -21.00%
1780     48.85     -19.19%     91.15    -19.05%
```

Calls AND puts down 10-30% on the same day. That is not direction, it is the
event premium leaving. The user's 1800 PE was down ~14% on a day the STOCK fell
and the thesis strengthened.

I had trailed the stop on that position to Rs 100 while it traded Rs 119 — a 16%
trail on an instrument whose day range was 85.65 to 133.45. It printed 95.50 on
the bounce and I issued a sell. The user refused, and thirty minutes later it was
Rs 105 (+Rs 14,625).

**The rule:** when the thesis is about the STOCK (an earnings collapse, a margin
break, a downtrend), the stop is a STOCK LEVEL — here, MAZDOCK closing above
1,800, the invalidation named at entry. An option-price stop on a stock thesis
measures IV normalisation and theta and mistakes them for the thesis failing.
Option-price stops are only correct when the trade's thesis IS the option price
(a premium-decay or vol trade).

**Corollary — always set a target at entry.** I trailed this position tighter and
tighter precisely because I never gave it one, so there was nothing to hold it
to and I managed it by nerves. A position with a thesis stop and no target will
get churned out by its own trailing stop.

**Corollary 2 — read OI for confirmation, not just the price.** The same session
showed 1800 CE +69,525 (the board's largest add: writers selling the idea of a
return to 1,800) and 1740/1720 PE +60,975/+56,700 fresh put buying. The chain was
defending the exact position I was trying to close.

## The SHORT-side structure check — the mirror, and it is NOT optional (set 2026-10-28)

The weekly-structure check above says "read the sequence of highs". That is
correct for a LONG. Applied to a put it is exactly half the picture, and it is
the half that flatters the trade.

On 28 Oct I bought ITC Nov 255/250 puts on "unbroken lower highs over four
months". True — and useless on its own:

```
week        high      low       close
28 Sep     269.30    254.65    255.90
05 Oct     269.80    253.15    266.00
12 Oct     267.40    256.95    263.50
19 Oct     264.85    254.80    257.90
26 Oct     260.50    252.85    259.50
```

Highs falling, **lows flat at 253-255 for five straight weeks**. That is a
descending triangle resting on proven support, not a downtrend. I bought puts on
the fifth test of that floor. It held, and ITC closed 259.50 — its exact day
high — after printing a fresh 52-week low at 252.80. Cost: -Rs 6,054.75.

**The rule — before buying ANY put:**
1. Read the sequence of **LOWS**, not the highs. Flat or rising lows under a
   falling high = compression on support. Never buy its puts. Only a sequence of
   LOWER lows is a downtrend.
2. **A fresh 52-week low that closes at or near the day's HIGH is a reversal,
   not a breakdown.** Same logic as "a stock up 2-6% inside lower highs is a
   bounce" — inverted. Never buy puts into it.
3. **Measure the stock against TODAY'S LOW, not yesterday's close.** When long
   puts, "-0.85% on the day" is meaningless if it is +2.0% off the low. On 28 Oct
   I checked ITC four times — 256.45, 257.05, 257.80, 259.50 — and reported each
   as "down on the day" while it rallied 2.65% off its low in front of me.
4. **The stock reclaiming its opening price after a new low invalidates the
   breakdown.** That is the stock-level stop for a put. ITC reclaimed 257.10
   before 14:37; calling it there would have saved Rs 1,897.50.

## OI change alone does NOT tell you who initiated (set 2026-10-28)

I told the user "call writing at 260, the market is capping ITC" on seeing
260 CE +4,871,400. By the close that strike was +5,000,775 to 11,845,575 OI and
ITC had closed at 259.50 — right at it. **Rising OI with a rising price is a long
buildup.** They were BUYERS and they were right.

Open interest went up; that is all the data says. Whether it was buying or
writing is an inference, and on 28 Oct I resolved that ambiguity in favour of
the position I had already recommended. Confirmation bias, plainly.

**The rule:** pair OI change with the PRICE direction of that same option and of
the underlying before claiming a side. Rising OI + rising price = longs. Rising
OI + falling price = writers. And when the OI on the other side is UNWINDING
(260 PE -476,100, 240 PE -634,800 that day), that is holders of MY side leaving —
read it as a warning, not as noise.

## The weekly-structure check — run this before naming ANY long

Pull 4 months of **weekly** candles and read the sequence of highs. This single
filter is what separated HAL (+12% over 4 months, uptrend — took it) from BEL
(−8.72%, lower highs, bouncing off a 4-month low — rejected) on 27 Oct, when
both were up ~2.8% on the same morning in the same sector. Without it I would
have repeated the INFY mistake exactly. A stock up 2–6% on the day inside a
sequence of lower highs is a bounce, not a trend — never buy its calls.

## Hard constraints — never violate

- **Groww MCP is READ-ONLY.** There is no order-placement tool on the Groww
  connector. I cannot place orders. I give trades; the user places them.
- **Kite MCP has `place_order` but is a DIFFERENT broker account.** Never fire
  an order there. Not once, not as a test.
- `GROWW_API_SECRET` is a **TOTP seed that mints trading sessions**. Never commit
  it, never print it, never echo it into chat, never write it into a spreadsheet
  cell. It belongs in PropertiesService / env vars only.
- Groww **Live Data APIs are a paid add-on**. The free tier excludes live quotes,
  LTP, OHLC, option chain and backtesting. Any bot design must account for this.
- Develop and push only on branch `claude/indian-trading-skills-install-fy13k5`.

## Account facts

- Broker: Groww. Working capital ~₹1,00,000.
- Segment traded: NSE F&O (index + stock options), occasionally cash.
- Lot sizes seen: AUBANK 1,000 · SHRIRAMFIN 825.

## Track record notes (so I stop repeating mistakes)

- **23 Oct:** Recommended INFY Oct 1180/1220 bull call spread as the highest
  conviction trade. Lost −₹3,360 of ₹3,540 max. My reasoning was "fresh call
  longs in IT, the only green sector" — by Monday IT was the *worst* sector.
  Lesson: one day of sector strength inside a downtrend is noise.
- **23 Oct:** Told the user to cut NIFTY 22700 CE at −₹299. Seventeen minutes
  later it was +₹2,795. Lesson: do not cut a position on a 20-minute adverse
  move when the thesis is intact.
- **27 Oct — THE SAME MISTAKE AGAIN, and it cost ₹6,517.50.** Told the user to
  sell the HAL Nov 5100 CE leg while simultaneously saying HAL's thesis was
  intact (spot 4,854 against my own invalidation of 4,640). The real problem was
  funding — ₹39,000 of premium against ₹25,324 of cash, a −₹22,315 debit — not
  the trade. I dressed a cash problem up as a trade decision and issued a sell
  instruction; the user closed BOTH HAL legs at 93.40 and 63.15 against entries
  of 115 and 85. Realised −₹6,517.50 on a position whose thesis I still
  believed. In the same message I also said to cut the MAZDOCK 1800 PE at
  −₹799 when its stop was ₹26 and it was trading ₹35.60 — the stop had not been
  hit and the −22.5% downtrend was intact.
  **Rules this burns in:**
  (a) A funding shortfall is never a reason to close a position with an intact
      thesis. Present it as the choice it is — add funds and hold, or reduce
      and accept the cost — and let the user decide. Do not issue a sell.
  (b) If the stop has not been hit and the thesis has not broken, the answer is
      HOLD. "It is underwater and I would rather fund something else" is not a
      sell signal.
  (c) Telling someone to sell one leg of a position they are confused about
      invites them to close all of it. Expect that, and never give a partial-exit
      instruction without stating explicitly what must stay open.
  (d) When the day's loss passes the 4% daily limit (₹4,000 on ₹1 lakh), say
      "stop for today" and give no new entries. 27 Oct closed −₹7,507.50 = −7.5%.
- **28 Oct — THIRD TIME. I told the user to sell at the day's LOW.** The MAZDOCK
  Nov 1800 PE was trading ₹88.60 at 09:53 (the day's low was ₹85.65). I ran a
  Black-76 model off their screenshot, computed a 60.3% probability that holding
  would underperform booking, and recommended selling. By 11:32 it was **₹112.10**.
  Selling would have cost **₹5,287.50**. The user said "MAZDOCK is still going
  down" and was right: it went 1,776 (its high, when I said sell) → 1,726.40.
  **What I actually did wrong:** I answered the wrong question. I computed
  "will holding beat selling at this instant" — a market-timing question I have
  no edge on — when the rule I had written the day before says the only
  questions are: has the stop been hit? has the thesis broken? Stop was ₹26
  against a price of ₹88.60. The thesis (−54% profit, 23.7%→8.1% margins) was
  intact. Both answers were no, so the answer was HOLD, and sophisticated maths
  pointed at the wrong question is still the wrong answer.
  **This is now three for three** (23 Oct NIFTY 22700 CE, 27 Oct HAL 5100,
  28 Oct MAZDOCK 1800 PE). It is my single most expensive habit.
  **Hard rule from here:** on a winning position with an intact thesis and an
  unhit stop, I do not model, I do not compute exit probabilities, and I do not
  recommend selling. I say HOLD and I move the stop up. The only legitimate
  exits are: stop hit, thesis broken, or a pre-committed target reached. "My
  model says the odds have turned" is not one of them.
- **26 Oct:** Was right that AUBANK was breaking independently of the index
  rally, and right to flag the Nov 800 PE as the only true lottery ticket in the
  set. Reading relative strength against the index worked.
- **22 Oct:** Told the user their "Swiggy 185 PE +18,000%" figure was wrong. It
  was not — `prev_close 0.05 → ltp 9.35 = +18,600%`. The candle feed had no
  22 Oct candle because the contract traded zero volume, but carried a ₹0.05
  settlement close. Lesson: a missing candle is not a missing move; check the
  settlement price before contradicting the user.

- **28 Oct, SECOND TIME THAT DAY — FOURTH TIME OVERALL.** At 14:04 I told the
  user to sell the MAZDOCK Nov 1800 PE at Rs 95.50 because the Rs 100 stop I had
  set ninety minutes earlier was breached. The position was +163%, the thesis was
  intact and the stock was 67 points below my own 1,800 invalidation. The user
  pushed back — "why to sell 1 mazdock trade, we should keep it in our portfolio"
  — and sent the chain, which showed calls and puts BOTH down 10-30%: pure IV
  collapse, not direction. By 14:37 it was Rs 105.00, +Rs 14,625.
  What made this one different from the first three: I was not ignoring a stop,
  I was OBEYING one — but I had set it on the wrong variable. See the section
  above. A badly measured stop obeyed precisely is still a bad exit.
  The user has now caught me on three of the four. When they say a position is
  still trending and I say sell, the base rate says they are right.

- **28 Oct — ITC puts, -Rs 6,054.75. A losing trade with BAD REASONING, which is
  the kind worth a rule change.** Bought Nov 255 and 250 puts on "a fresh 52-week
  low plus four months of lower highs", and told the user to HOLD at 14:37 on
  three supports, two of which were false:
  (a) I read the OI backwards — called +4.87m at the 260 strike "call writing /
      resistance" when rising OI into a rising price is a long buildup. ITC
      closed 259.50, at that strike. Those calls were bought.
  (b) I read only the weekly HIGHS (falling, supported my trade) and never the
      weekly LOWS (flat at 253-255 for five weeks — a floor, refuted it).
  (c) I quoted option-price stops in the very message where I had just argued
      stops belong on the stock, an hour earlier, about MAZDOCK.
  And underneath all three: I measured ITC against yesterday's close instead of
  today's low, so four checks showing 256.45 -> 257.05 -> 257.80 -> 259.50 all got
  reported as "down on the day" while it rallied 2.65% off the low.
  Contrast MAZDOCK the same week: a dated, quantified event (profit -54%, margin
  23.7%->8.1%), +Rs 13,815. ITC had no catalyst, only a chart I liked. The bot's
  own prompt says "an edge needs a cause - not 'it is oversold'". I wrote that
  and then traded against it.
  **Never short a high-yield defensive on chart structure alone.** ITC yields
  over 4%; every fall into the low 250s brings income buyers. Breaking that
  floor needs an event, and there wasn't one.

## Repo conventions

- Trading skills live in `.claude/skills/` (repo-vendored so they survive the
  ephemeral container; `~/.claude/skills/` is wiped on every restart).
- `scripts/install-indian-trading-skills.sh` installs all vendored skills to a
  user-level skills dir.
- The Sheets trading platform lives in `sheets-trading-bot/`.

## STANDING ORDER — sector first, then stocks (set 2026-11-12 at user instruction)

The user's process instruction, verbatim in substance: *"You have to first check which
sector is trending, which stocks of which sector are trending, which sector is on the
upward or in a downward trend. You have to check the trend of both sides only."*

So the workflow for EVERY trade request is now, in this order:

1. **Pull the sector indices first.** NIFTY IT, Metal, Pharma, Auto, FMCG, Bank, PSU Bank,
   Realty, Energy, Commodities. Rank them by day change. Write the ranking down.
2. **Name the leaders and the laggards.** Both sides. A falling sector is a put hunting
   ground, not something to skip.
3. **Only then** go to stocks inside the top-2 and bottom-2 sectors.
4. **Run the direction-specific gate** on each candidate (longs: sequence of HIGHS +
   supertrend up + DI ratio; shorts: sequence of LOWS, per the short-side section above).

The reason this matters: on 12 Nov the user spotted that IT was the weakest sector on an
AI-bubble narrative and asked for IT puts. The sector call was CORRECT — IT was -0.45%,
second-weakest on the board, with TCS/HCLTECH/TECHM all reading bearish DI (0.65x/0.58x/
0.66x) and ADX 44-46. I had spent the whole week saying "no genuine downtrend exists in
F&O" because I was only ever scanning the momentum names. The downtrend was sitting in IT
and I never looked. Scanning sectors first would have found it.

## Prefer BIG LOTS — the position must be able to pay (set 2026-11-12 at user instruction)

*"From next time, the big lots only, which can make big money, like Sona Comms."*

Lot size, not share price, decides how much a trade can make. On 12 Nov:
- LT trades at Rs 4,186 but its lot is 175, so its 4400 CE cost Rs 2,599.
- SONACOMS trades at Rs 929 but its lot is 1,225, so its 980 CE cost Rs 8,024.

The Rs 929 stock was the bigger position. "Big stock" does NOT mean "big money at work."
So: rank candidates by `lot_qty x premium` and prefer the ones where a 1-rupee move in the
option is worth real money (PNB 8,000 / IRFC 5,425 / BANKBARODA 2,925 / SONACOMS 1,225
class), not the ones with 75-200 lots (NAVINFLUOR 75, LT 175, M&M 200, TIINDIA 200) where
even a 5x barely registers on a Rs 1 lakh account.

## The strike must sit BELOW the supertrend ceiling (set 2026-11-12)

A new rule, learned three times in one morning:

- **BEL 420 CE** — BEL's st_upper_band was 420.66. The strike was 420. The option needed
  the stock to reach the exact level the trend model called the ceiling.
- **LT 4400 CE** — ceiling 4,420.03 against a 4,400 strike. Only 20 points of intrinsic
  available if LT reached its own ceiling. I rejected it for this and bought M&M 3600
  instead (ceiling 3,688.29 = 88 points of headroom, 4x the payoff for the same thesis).
- **SONACOMS 980 CE** — the user filled 980 where I had specified 960. SONACOMS' ceiling
  is 968.25, so the 980 strike sits ABOVE it; breakeven 986.55 needs the stock to clear
  its own trend ceiling by 1.9% just to get going.

**The rule: compute `st_upper_band` first, then pick a strike with real distance between
the strike and that ceiling.** Headroom = st_upper_band - strike. If that number is small
or negative, the strike is wrong no matter how good the stock is. State the headroom in
rupees in every trade I give.

## Confirmed again on 12 Nov — the LOWS rule saved money

The user asked for IT puts on a correct sector read. I pulled 18 daily candles on TCS
before committing. Highs: 2,625.00 -> 2,565.00 -> 2,513.90 -> 2,506.00 -> 2,466.00, clean
lower highs, which SUPPORTED the trade. Lows: 2,408.20 (28 Oct) -> 2,420.00 -> 2,449.60
-> 2,442.00 -> 2,427.50 — **the 28 Oct low was never broken in two weeks.** Flat floor
under a falling ceiling = descending triangle on proven support. That is the ITC setup
that cost Rs 6,054.75, line for line. And TCS was trading at 97% of its day range,
+1.54% off the low, while reading "down on the day."

**No put bought.** Trigger set instead: TCS closing below 2,408.20. The rule works, but
only if I actually pull the candles instead of trusting the DI reading.

## CHECK THE DATA CALENDAR, not just the earnings calendar (set 2026-11-13)

On 12 Nov, AFTER the close, India's October CPI printed **6.09%** — a 24-month high,
food inflation 8.94%, the first breach of the RBI's 6% ceiling in two years. The RBI
was already at repo 5.50% after an October hike with a "calibrated tightening" stance;
ICRA now calls a further 25bps on **4 December** "almost certain". The US FOMC meets
**8-9 December** with ~86% market odds of its own 25bps hike.

The 13 Nov open gapped down on that print: Nifty -0.81%, Bank Nifty -1.02%, 13 of 14
sectors red, and NINE of the eleven open positions went red at once.

I had checked the earnings calendar on every name. I never checked the **macro data
calendar**. A CPI release date is as knowable as a results date, and it hits EVERY
position simultaneously instead of one.

**The rule:** before building or holding a multi-position book, check the scheduled
macro prints and policy dates — CPI/WPI, RBI MPC, FOMC, GDP, IIP — the same way I check
company results. A basket of ten longs held through a known CPI date is one bet, not ten.
Name the next macro date in every basket I give, and size for it.

## A BOOK OF TEN IS NOT DIVERSIFICATION IF IT IS ONE THEME ON BORROWED MONEY (set 2026-11-13)

What actually broke on 13 Nov was not stock selection, it was structure:
- **Ten long calls, all one direction.** No hedge, no short leg, nothing that pays on a
  down day.
- **Six of them banks** (PNB, UNIONBANK, BANKBARODA, CANBK + MUTHOOTFIN, and a
  BANKNIFTY 64000 CE). One rate print hit all six.
- **All 23 Nov expiry.** Identical theta and identical event exposure.
- **Funded with debt.** `clear_cash` -Rs 99,332.83 against Rs 69,151 of remaining
  position value = **negative net equity of Rs 10,587**. Liquidating the ENTIRE book
  raises less than the debit.

Basket rule 7 says deliver 5-6 positions. It never said make them all the same bet, and
it never said buy them on margin. A basket is only a basket if the names can disagree.

**The rule:** cap one sector at 2 positions. Stagger expiries. And the hard one —
**when `option_buy_balance_available` is negative, the answer to "give me a fresh trade"
is "there is no money", not a trade.** I gave new entries on 11, 12 and 13 Nov with the
cash balance already negative every single time. That is the error underneath every
other error this week.
