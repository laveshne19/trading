# The Confirmed Trade Protocol

A trade is **not** "MAXHEALTH is up, buy MAXHEALTH calls." That is a tip, and tips are
how this account lost money. A confirmed trade is a **filled dossier**. Every field
below must carry a real number pulled from a tool in this session.

> **If any MANDATORY field is empty, there is no trade. Say "no trade today" and say
> which field could not be filled.** "No trade" is a complete, professional answer.
> An unfilled dossier presented as a trade is the failure mode this file exists to stop.

Fill the dossier in order. Later sections are wasted work if an earlier gate fails.

---

## A — MARKET REGIME (mandatory; do this before looking at any stock)

| # | Field | Source |
|---|---|---|
| A1 | NIFTY: spot, day %, supertrend direction, both bands, ADX, +DI, −DI, RSI, ATR | `segment="INDEX"` |
| A2 | BANKNIFTY: same | `segment="INDEX"` |
| A3 | **India VIX: level and direction.** Rising VIX inflates every premium you buy | quote |
| A4 | Where is NIFTY in today's range: `(LTP − Low) / (High − Low)` | quote |
| A5 | US close last session: S&P, Nasdaq, Dow in % | web |
| A6 | Asia today: Nikkei, Hang Seng, KOSPI | web |
| A7 | **Bitcoin** — the cleanest live global risk-appetite gauge, trades weekends | web |
| A8 | GIFT Nifty indication vs previous close | web |
| A9 | FII/DII net flow, last 3 sessions | web / `fii-dii-flow-tracker` |
| A10 | Breadth: advance/decline, % above MAs | `india-market-breadth` |

**Regime verdict — write one of these explicitly:**
`RISK-ON` · `RISK-OFF` · `DIVERGENT` (global and India disagree — say which way) ·
`NO REGIME` (chop; the correct action is usually no trade)

**Hard rule:** in RISK-OFF, long calls need a *named reason India is exempt*. On
20–23 Nov that reason existed and was specific: the shock was an AI/semiconductor
derating plus an SEC probe into one US company, and India's index owns no
semiconductors. "India is strong" is not a reason. "India has no exposure to the thing
that is falling, and here is the sector proving it" is.

---

## B — SECTOR (mandatory)

| # | Field |
|---|---|
| B1 | All sector indices ranked by day %: IT, Bank, PSU Bank, Pharma, Auto, FMCG, Metal, Realty, Energy, Commodities |
| B2 | For each of the top 2 and bottom 2: ADX, DI ratio, RSI, headroom to its own ceiling |
| B3 | **Is the candidate in a top-2 or bottom-2 sector?** If neither — justify or drop it |
| B4 | **Is the candidate leading or lagging its own sector today?** A laggard inside a strong sector is not a momentum trade |
| B5 | Is the move sector-wide or one name? Name the peers and their day % |

**B5 is not optional.** On 20 Nov the "pharma is strong" reading was true at index
level and false at trade level: hospitals were moving (APOLLOHOSP +5.6%, MAXHEALTH
+4.1%, Jupiter Life Line +12.9%, Thyrocare +3.9%) while drug makers were not
(SUNPHARMA and DIVISLAB calls both bleeding double digits). Checking peers separated
the real move from the index average.

---

## C — THE STOCK: full chart scan (mandatory)

| # | Field |
|---|---|
| C1 | **4 months of WEEKLY candles — write out the full sequence of HIGHS** |
| C2 | **4 months of WEEKLY candles — write out the full sequence of LOWS** |
| C3 | 18+ DAILY candles: the sequence of highs and lows |
| C4 | Supertrend: direction (+1/−1), `st_upper_band`, `st_lower_band` |
| C5 | ADX, +DI, −DI, **DI ratio** |
| C6 | RSI |
| C7 | ATR absolute **and as % of spot** (this drives every probability below) |
| C8 | Today: open, high, low, LTP, **range position %** |
| C9 | Distance to 52-week high and 52-week low, in % |
| C10 | Volume vs its own average |
| C11 | **Relative strength vs its sector index and vs NIFTY** over 5 and 20 days |

**C1 and C2 are both mandatory for every trade, in both directions.** Writing only
the side that supports the trade is precisely the ITC error (−₹6,054.75): highs falling
for four months was true and published; lows flat at 253–255 for five weeks was true
and never looked at. The second sequence is the one that refutes you, which is why it
gets skipped, which is why it is mandatory.

**Direction gate:**
- **CALL** needs: higher highs AND higher lows, supertrend +1, DI ratio > 2.0
- **PUT** needs: **lower LOWS** (not merely lower highs), supertrend −1, DI ratio < 0.5
- Falling highs over flat lows = descending triangle on support. **No trade either way.**

---

## D — THE CAUSE (mandatory — this is the field that is usually missing)

| # | Field |
|---|---|
| D1 | **The dated, named, quantified catalyst.** Who said it, when, with what number |
| D2 | Is it new today, or already 3 days old and priced in? |
| D3 | Second-order chain: who else is affected, and are they confirming? |
| D4 | What has to keep being true for this to keep working? |

**"It is trending" / "ADX is high" / "it is breaking out" are NOT causes.** They are
descriptions of the past.

A real D1 reads like: *"Macquarie, today, double upgrade Outperform from Underperform,
target ₹1,450 vs spot ₹1,083, citing stabilising earnings and easing valuation
concerns"* — or *"Q2 profit −54% to ₹344 cr against ~₹999 cr expected, operating margin
23.7% → 8.1% on ₹413 cr of provisions"* (MAZDOCK, +₹13,815 — the best trade of the
period, and the only one with a hard number behind it).

**If D1 cannot be filled: either no trade, or label it `MOMENTUM-ONLY` and size it at
half.** The ITC loss and the INFY loss were both chart-only trades with no D1.

---

## E — EVENTS (mandatory)

| # | Field |
|---|---|
| E1 | Next earnings date for this company. **Inside the holding period?** |
| E2 | Macro calendar through the holding period: CPI, WPI, RBI MPC, FOMC, GDP, IIP |
| E3 | Expiry dates: which expiry, days to it, any expiry inside the hold |
| E4 | Market holidays inside the holding period |
| E5 | F&O ban list, ex-dividend, MSCI/index rebalance, corporate action |

**Any event inside the holding period reclassifies the trade as an EVENT BET.** Say so
in those words, and size it as money that can go to zero overnight. A gap through a
stop is the normal outcome of a miss, not bad luck. *Paid for:* 12 Nov CPI printed
6.09% after the close; the 13 Nov open put **nine of eleven positions red at once.*
Every earnings date had been checked. The macro calendar had not.

---

## F — FULL OPTION CHAIN SCAN (mandatory — not one strike)

**Pull at least 5 strikes either side of spot. For EVERY strike record:**

```
strike | LTP | day chg % | OI | OI chg % | volume | bid | ask | spread | spread %
```

Then derive:

| # | Field |
|---|---|
| F1 | **Day change % on the strikes you want.** A falling call on an up day = REJECT, whatever the chart says |
| F2 | **OI change paired with price direction** — up+up = longs, up+down = writers, up+flat = writers |
| F3 | Where is OI concentrated? That wall is the market's expected ceiling |
| F4 | PCR, and max-pain strike |
| F5 | **IV inflation: how far has this strike already run today?** Prefer the least-moved |
| F6 | **Intrinsic vs time value split**, in rupees and % |
| F7 | **Liquidity test: bid-ask spread in % of premium.** Over ~2% is a tax on both sides |
| F8 | Can you exit 1 lot at the bid? Check depth qty at bid, not just the quote |
| F9 | What does the PUT side say at the same strikes? If puts are being bought heavily, say so |

**F9 is the disconfirming read and is mandatory.** On 28 Oct the chain was defending
the exact position being closed: 1800 CE +69,525 (writers selling a return to 1,800)
while 1740/1720 PE added +60,975/+56,700 of fresh put buying. Reading only one side of
the chain is reading your own opinion back.

---

## G — THE ARITHMETIC (mandatory; every line a number)

```
headroom            = st_upper_band - strike                      Rs ______
breakeven           = strike + premium                            ______  (____%  move)
ATR% per day        = ATR / spot                                  ____%
expected range      = ATR% x sqrt(days to expiry)                 ____%
SDs needed          = move to breakeven / expected range          ____ SD
intrinsic           = max(0, spot - strike)                       Rs ______ (___% of premium)
time value          = premium - intrinsic                         Rs ______ (___% of premium)
theta as % of posn per day                                        ____%
delta-based recovery = loss / (delta x lot)                       ____%
cost                = lot x ask                                   Rs ______
loss at stock stop                                                Rs ______
R:R at target 1 / 2 / 3                                           __ : 1
```

**Gates on these numbers:**
- `headroom <= 0` → **REJECT** (unless explicitly labelled a lottery ticket, see I)
- `SDs needed > 1.0` → **REJECT.** Under 0.6 is defensible
- `spread % > 2%` → reject or halve size
- `time value = 100% of premium` and theta > 8%/day → reject for any multi-day hold
- **Use delta for recovery maths, never expiry breakeven.** Quoting breakeven as the
  recovery number overstates it badly — "+2.7% to +6.1%" was stated when the true
  delta-based figures were +0.32% and +0.47%

---

## H — PORTFOLIO FIT (mandatory)

| # | Field |
|---|---|
| H1 | Cost as % of **total capital** |
| H2 | **`clear_cash`** — not `option_buy_balance_available`. Does this create a debit? How large? |
| H3 | Net equity = collateral + position value − debit. Positive? |
| H4 | Sector exposure after this trade. **Cap: 2 per sector** |
| H5 | Expiry concentration after this trade. Stagger them |
| H6 | **Correlation with every open position.** Would one event hit several? |
| H7 | Risk if ALL stops fire together, in rupees and % of capital |
| H8 | Open risk today vs the daily loss limit |

**H6 and H7 are what actually broke the account on 13 Nov** — not stock selection. Ten
long calls, one direction, six of them banks, all one expiry, bought on margin. One
rate print hit all six simultaneously. Realised **−₹27,296.25** in a session.

---

## I — THE EXIT, WRITTEN BEFORE ENTRY (mandatory)

| # | Field |
|---|---|
| I1 | **Stock stop level** — a price on the STOCK, never on the option |
| I2 | Which level and why: today's low / today's open / spot − 1 ATR / supertrend band |
| I3 | **Thesis-break definition in one sentence** — what fact, not what price |
| I4 | Target 1, 2, 3 with the option value and rupee P&L at each |
| I5 | Time stop: the date this is abandoned if it has done nothing |
| I6 | **Gap plan:** if it opens beyond the stop, what then? The stop will not have worked |
| I7 | Trade class: `CORE` / `MOMENTUM-ONLY` / `EVENT BET` / `LOTTERY TICKET` |

**A LOTTERY TICKET breaks the headroom rule by design.** That is permitted only when
labelled as such, sized as money that can go to zero, justified with the SD maths, and
quoted with honest odds ("roughly 35–50% above breakeven, otherwise the whole premium
goes"). Never mix one into a basket without saying which is which.

---

## J — THE DISCONFIRMING CASE (mandatory; write it, don't think it)

| # | Field |
|---|---|
| J1 | **What is the strongest argument AGAINST this trade?** |
| J2 | What would a good trader on the other side point to? |
| J3 | Which dossier field is weakest, and how much does that matter? |
| J4 | What does the option chain's other side say? |
| J5 | Have I taken this trade before? What happened? |

**J is where confirmation bias gets caught.** On 28 Oct an ambiguous OI reading was
resolved in favour of the position already recommended — ITC 260 CE +4.87m was called
"call writing, the market is capping ITC." It closed +5.0m to 11.85m OI with ITC at
259.50, right at that strike. They were buyers. Writing J1 before publishing would
have surfaced the alternative reading.

**J5 catches repeats.** SONACOMS was named as the template of a good trade; by 20 Nov
its DI ratio had flipped to 0.50× bearish and it had fallen from 929 to 890.

---

## K — THE OUTPUT

Only once A–J are filled:

```
TRADE:        BUY <SYMBOL> <EXPIRY> <STRIKE> <CE/PE> @ <ask>   (MARKET order)
LOTS:         1 lot = <qty>              COST: Rs <cost>
CLASS:        CORE / MOMENTUM-ONLY / EVENT BET / LOTTERY TICKET
CONVICTION:   HIGH / MEDIUM / LOW   (LOW = do not trade it)
HEADROOM:     Rs <x>       INTRINSIC: Rs <x> (<y>%)      SDs NEEDED: <x>
THE CAUSE:    <one line, dated, named, quantified>
STOCK STOP:   <stock level>   -> loss Rs <x>
THESIS BREAK: <one sentence>
TARGETS:      <level> -> Rs <x> (<y>x)   ...
TIME STOP:    <date>
AGAINST IT:   <the strongest counter-argument, stated plainly>
```

Then the ranked basket of 5–6 with the same fields, the top pick named, the rejected
candidates listed **with their reasons**, the next macro date named, and the total
cost against available funds.

**Every trade also carries its own kill line: the one fact that would make me say
"close it" the moment it appears.** Not a price — a fact.
