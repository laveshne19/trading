# Trading plan — Monday 30 November 2026
Built Friday 27 Nov 2026, 14:10 IST, from live Groww data.

## Macro calendar (the thing that outranks every chart below)
- **RBI MPC — Friday 4 December.** Repo 5.50% after the October hike. October CPI 6.09%
  (24-month high, first breach of the 6% ceiling in two years). A further 25bps is widely
  expected. 4 trading sessions after Monday.
- **FOMC — 8-9 December.**
- Both land inside the 29 Dec expiry. Every bank position is one bet on 4 Dec.
- No company results inside the window for any name below (Q2 done, Q3 late January).

## Friday's single most important finding
Friday was a **call-writing day across the whole board**. Rising OI with a falling option
price = writers. Nine strikes checked, seven show writers adding:

| contract | price chg | OI chg | read |
|---|---|---|---|
| AXISBANK 1400 CE | -28.35% | +27.87% | heavy writing |
| AXISBANK 1500 CE | -37.70% | +17.39% | writing |
| ICICIBANK 1600 CE | -25.98% | +27.00% | heavy writing |
| CIPLA 1440 CE | -13.50% | +39.00% | heaviest writing |
| SUNPHARMA 1920 CE | -12.81% | +16.26% | writing at our strike |
| SUNPHARMA 1940 CE | -14.35% | -37.64% | **longs abandoning** |
| TRENT 3300 CE | -0.29% | +22.66% | writing |
| SBIN 1100 CE | -12.34% | **+0.23%** | no writing |
| EICHERMOT 8100 CE | -26.54% | **+1.81%** | no writing |
| TORNTPHARM 5000 CE | **+4.01%** | **-15.12%** | **short covering** |

Professionals sold upside premium into the close, four sessions before the MPC. Buying calls
against that flow is fighting it. Only EICHERMOT and TORNTPHARM escaped.

## Sector board, 27 Nov 14:09
```
Metal          +1.21%   leader all day, strengthening
Midcap Select  +0.30%
PSU Bank       +0.01%
Pharma         -0.20%
Bank Nifty     -0.49%
FMCG           -0.68%
NIFTY 50       -0.83%
Private Bank   -0.84%
IT             -1.00%
Auto           -1.12%   laggard
India VIX      16.22, -3.68%   (index down, vol down = rotation, not a sell-off)
```

## The three open positions

### HDFCBANK 26DEC 830 CE — 650 @ 36.00 — HOLD
Passes the full gate. The only position not on pure time value.
- weekly highs, 4wk: 795.00 -> 817.85 -> 850.35 -> 871.60  (+9.6%, clean rising)
- weekly lows,  4wk: 688.60 -> 785.95 -> 802.40 -> 814.05  (+18.2%, clean rising)
- 4 months: 669.20 base -> 862.25 = +15.3%
- ADX 80.28 · +DI 37.22 / -DI 3.23 = **11.53x** (strongest DI in F&O scanned)
- intrinsic 32.25 / 45.00 = **71.7%**
- breakeven 866.00; the 23 Nov week already printed 871.60
- supertrend 796.44, 66 pts below spot · PCR 0.698
- Friday: stock +0.03% vs NIFTY -0.83%
- **STOP: close below 848. TARGET: spot 895 -> option ~73 -> +Rs 24,050 from entry.**

### SUNPHARMA 26DEC 1920 CE — 350 @ 42.00 — CLOSE on Monday's open
Fails the weekly-structure check and the OI check. THESIS_BROKEN, not a price decision.
- weekly highs, 4wk: 1,929.40 -> **1,943.90** -> 1,914.80 -> 1,931.00
  The 09 Nov high has not been exceeded in two weeks. **Flat ceiling 1,914-1,944.**
- weekly lows,  4wk: 1,722.00 -> 1,869.80 -> 1,856.80 -> 1,851.50 (rising)
  => rising lows under a FLAT ceiling = compression, not an uptrend
- **breakeven 1,962.00.** SUNPHARMA last traded above that in the week of 31 Aug
  (high 1,984.80) — three months ago. Every weekly high since is below it.
- chain, 29 Dec, spot 1,903.20:
  1800 PE 764,050 OI (+31,850 today) floor defended
  1900 CE 647,500 OI (+85,050) call writing
  1920 CE 365,400 OI (+52,500) writing at our strike
  1940 CE 283,500 OI (-171,150) **longs abandoning**
  2000 CE 803,250 OI — the wall · PCR 0.678 call-heavy
- Headroom error to correct: I used st_upper_band 1,991.01 (= 71 pts from the strike).
  The real price ceiling is 1,943.90 (= 23.90 pts).

### COALINDIA 26DEC 375 PE — 1,350 @ 3.45 — CLOSE on Monday's open
Fails the short-side structure check. The ITC descending triangle.
- weekly lows: 390.65 -> **380.40** -> 392.00 -> 398.55 -> 386.55 -> **380.60**
  The same floor twice, five weeks apart, unbroken.
- weekly highs: 419.80 -> 405.00 -> 411.00 -> 408.20 -> 404.80 -> 392.35 (falling)
- PCR **0.615** — call OI 28.1m vs put OI 17.3m, the chain leans the other way
- spot 388.05 vs strike 375 = 13.05 OTM, 100% time value, 32 days left
- high-yield PSU defensive with no catalyst — banned by the ITC rule outright

## Monday basket, ranked
Prices live at 14:09 Friday. Headroom = min(st_upper_band, 4wk highest weekly high) - strike.

| # | order | lot | cost | stop (CLOSE) | max loss | target | reward | R:R | headroom | trend | OI |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **BUY EICHERMOT 26DEC 8100 CE @ 234.85** | 100 | 23,485 | 7,870 | 11,485 | 8,600 -> 560 | 32,515 | **2.83** | 687.65 (3.26 ATR) | ADX 61.64, DI 4.15x | +1.81% no writers |
| 2 | BUY TORNTPHARM 26DEC 5000 CE @ 155.75 | 125 | 19,469 | 4,935 | 7,594 | 5,250 -> 285 | 16,156 | 2.13 | 276.08 (3.01 ATR) | ADX 36.02, DI 2.82x | -15.12% covering |
| 3 | TRENT 26DEC 3300 CE @ 103.00 | 225 | 23,175 | 3,207 | 10,125 | 3,500 -> 228 | 28,125 | 2.78 | 219.06 (2.72 ATR) | ADX 63.94, DI 9.12x | +22.66% writing |
| 4 | AXISBANK 26DEC 1400 CE @ 34.00 | 625 | 21,250 | 1,355 | 9,375 | 1,500 -> 112 | 48,750 | **5.20** | 111.23 (3.13 ATR) | ADX 64.15, DI 3.17x | +27.87% writing |
| 5 | ICICIBANK 26DEC 1600 CE @ 37.60 | 700 | 26,320 | 1,562 | 12,320 | 1,665 -> 78 | 28,280 | 2.30 | 76.80 (2.27 ATR) | ADX 77.32, DI 2.29x | +27.00% writing |
| 6 | CIPLA 26DEC 1440 CE @ 39.40 | 650 | 25,610 | 1,417 | 9,100 | 1,520 -> 92 | 34,190 | 3.76 | 92.32 (3.55 ATR) | ADX 31.42, DI 2.26x | +39.00% writing |

**Buyable at Monday's open: #1 and #2 only.** Spreads 0.62% and 0.90%; lot sizes verified
from the order book (EICHERMOT 100, TORNTPHARM 125, TRENT 225, AXISBANK 625, ICICIBANK 700,
CIPLA 650).

Triggers for the rest:
- #3 TRENT — close above 3,302.25 (Friday's high)
- #4 AXISBANK — **after the 4 Dec MPC**, plus a close above 1,407.70
- #5 ICICIBANK — after the MPC, plus a close above 1,616.00
- #6 CIPLA — close above 1,455.45 AND the 1440 CE OI falling, not rising

Sector cap 2: HDFCBANK is bank #1, so take AXISBANK **or** ICICIBANK, never both.

## What NOT to buy, with the reason
- **ASHOKLEY puts.** The only F&O name reading supertrend DOWN + ADX 49.59 + DI 2.54x bearish
  + RSI 26.41. Rejected anyway: weekly lows 140.01 -> 145.66 -> 169.06 -> 156.16 -> **149.27**
  are RISING, 9.26 above the 26 Oct floor. Falling highs over an unbroken floor = the ITC
  triangle. And its puts are already up 41-66% intraday (150 PE +59.05%, 145 PE +66.34%,
  140 PE +65.57%) — straight through the 40% IV-inflation reject.
- **All metals.** 8 of 10 read supertrend DOWN with bearish DI and RSI 30-40 despite the
  sector leading +1.21% all day. The two reading UP (JSWSTEEL, JINDALSTEL) have DI 0.48x
  and 0.38x. No cause identified for the sector's strength. Oversold bounce.
- **All IT puts.** TCS, INFY, HCLTECH, WIPRO, TECHM, PERSISTENT, COFORGE, MPHASIS all read
  supertrend UP. TCS is now +DI 26.96 / -DI 17.39 = 1.55x BULLISH (was 0.65x on 12 Nov).
- **All auto puts.** MARUTI DI 2.11x, EICHERMOT 4.15x, HEROMOTOCO 2.06x, TMCV 1.62x — up.
- **SBIN 1100 CE.** Passes every technical check (ADX 88.41, DI 7.17x, 54.7% intrinsic, no
  writing at all, rising weekly highs 1,025 -> 1,091 -> 1,175 -> 1,182). Fails on R:R 0.72:1
  — ceiling 1,165.38 vs spot 1,128.25 = only 37 points of room. The move already happened.
- **MARUTI 13800 CE.** OI +34.15% writing, and lot 50 means Rs 50 per rupee of option move.

## Funding
```
clear_cash                     -Rs 139,697.64
cnc_balance_available          -Rs 140,032.80
collateral_available            Rs 194,343.81
collateral_used                -Rs  76,773.75
option_buy_balance_available    Rs 131,084.76   (inflated by pledged collateral — not cash)
```
Nothing in the basket is affordable on real cash. Closing SUNPHARMA + COALINDIA raises about
Rs 17,845. EICHERMOT needs Rs 23,485.

Friday's realised: **-Rs 19,501.25** = -19.5% of a Rs 1 lakh base, against a 4% daily limit.
No new entries were given Friday for that reason.

## Rule change this session produced
Headroom was being measured against `st_upper_band` alone. For SUNPHARMA that read 71 points
of room from the 1920 strike when the actual three-week price ceiling left 23.90.

**New: headroom = min(st_upper_band, highest weekly high of the last 4 weeks) - strike.**

That single change rejects the SUNPHARMA 1920 CE at entry.
