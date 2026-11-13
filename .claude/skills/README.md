# Vendored Claude Skills

## Indian trading skills

Ten Claude Skills for Indian equity and derivatives markets (NSE/BSE), vendored
from [ajeeshworkspace/indian-trading-skills](https://github.com/ajeeshworkspace/indian-trading-skills)
at commit `dc44698`.

Because they live in `.claude/skills/`, Claude Code discovers them automatically
in any session started from this repository. To make them available in **every**
project on your machine, copy them to the user-level skills directory:

```bash
./scripts/install-indian-trading-skills.sh --with-deps
```

That copies each skill to `~/.claude/skills/<name>/` and installs the Python
packages the bundled scripts import. Restart Claude Code afterwards so the new
skills are picked up.

## The skills

| Skill | Use it for | Data source |
|---|---|---|
| `technical-analyst` | Weekly chart reads: trend, S/R, probability-weighted scenarios | Chart images you provide |
| `nse-vcp-screener` | Minervini Volatility Contraction Pattern screens over Nifty 50/200/500 | yfinance |
| `india-stock-analysis` | Fundamental + technical reports, peer comparisons, promoter/FII holding | Groww MCP or yfinance |
| `scenario-analyzer` | 18-month probabilistic scenarios from a headline or policy event | Bundled reference data |
| `fii-dii-flow-tracker` | Institutional buy/sell flows and their read-through to Nifty | Bundled methodology + live lookups |
| `india-market-breadth` | Advance/decline, % above MAs, new highs/lows, sector participation | yfinance |
| `options-strategy-advisor` | F&O strategy selection, Greeks, payoff and risk analysis | Black-Scholes script + live quotes |
| `backtest-expert` | Backtest validation, overfitting checks, robustness testing | Your backtest results |
| `india-news-tracker` | Daily news briefings, SEBI circulars, bulk/block deals, earnings calendar | MoneyControl, ET, LiveMint, BSE/NSE |
| `weekly-fno-trade-planner` | Weekly directional call, option structure, entry/exit and position management | Combines the above |

## Standalone scripts

Some skills ship CLIs you can run directly, for example:

```bash
python3 .claude/skills/nse-vcp-screener/scripts/screen_vcp.py --universe nifty50
python3 .claude/skills/nse-vcp-screener/scripts/screen_vcp.py \
  --custom-tickers RELIANCE,TCS,INFY --output-dir reports/
```

## Dependencies

`pyyaml`, `scipy`, `yfinance`, `pandas`, `niftystocks` — installed by the
installer's `--with-deps` flag, or manually with `pip install`.

## Note

These skills produce research and analysis, not investment advice. Nothing here
places orders on its own.

## License

MIT, per the upstream project.

## groww-api

A Claude Skill for the [growwapi](https://github.com/NithinSGowda/growwapi)
Node.js SDK (v1.1.3) — the one path to **placing** orders on a Groww account
from code. The Groww MCP server in Claude is read-only; this SDK is not.

It documents the real API surface read from source, the TOTP → access-token flow
that removes the manual daily-token step, and the four packaging defects that
stop the published package from importing at all. `scripts/install-growwapi.sh`
installs, patches and verifies in one command.

Verification run against a clean extract of v1.1.3:

- 32/32 structural checks (`scripts/smoke-test.mjs`) — module loads, all nine
  resources and every method present, enum values match the wire format
- 11/11 wire-level checks (`scripts/wire-test.mjs`, `fetch` stubbed) — TOTP
  minted, token obtained, order payload snake_cased correctly, response
  camelCased back, token cached across calls

No live API call is made by either script, and neither needs real credentials.

**This SDK trades real money and has no sandbox.** Read the Safety section of
`groww-api/SKILL.md` before wiring it to anything automatic.

## Day Trader pack (11 skills)

The [day-trader-skill](https://github.com/Jakeschincariol/day-trader-skill) plugin
v2.0.0 by Jake Schincariol, MIT (licence kept as `DAY-TRADER-LICENSE`). Vendored
as plain skill folders rather than installed as a plugin, so the commands are
`/trader-scanner` and not `/day-trader-skill:trader-scanner` — the route the
upstream README gives for unprefixed names.

| command | job |
| --- | --- |
| `/trader-scanner` | Scans thousands of charts for opening-range breakouts, flags, oversold bounces |
| `/trader-news` | Yahoo headlines + SEC 8-K filings per ticker, only what is new since last check |
| `/trader-entry` | Watches a setup bar by bar, calls the entry on the first close above the range |
| `/trader-exit` | Stop and target set before entry; refuses an inverted or too-tight stop |
| `/trader-timemachine` | 10,000 replays from the stock's own bars, plus every past session the setup fired |
| `/trader-risk` | PASS/BLOCK against max loss, reward:risk, daily limit, trades per day, entry window |
| `/trader-budget` | Whole-share sizing inside four limits, says which one binds |
| `/trader-broker` | Prints the ticket and the exact Alpaca `place_stock_order` JSON — places nothing |
| `/trader-alerts` | Stop / target / flat-by-close alerts, NYSE hours with 2026–27 holidays |
| `/trader-analyst` | SEC XBRL company facts quarter by quarter, margins and EPS vs a year earlier |
| `/trader-pelosi` | House Clerk Periodic Transaction Reports parsed into rows |

Pipeline: `scanner → news → entry → exit → timemachine → budget → risk → broker`,
each reading what the last wrote into a `trader/` folder.

### Verification

- **315/315 tests pass** (`python3 -m unittest discover -s tests -t tests`, 13 s,
  all stdlib `unittest`, no pip install). Run from an upstream checkout: the
  suite's `test_repo.py` asserts exactly eleven skill folders beside `tests/`, so
  it cannot run against this directory, which holds twenty-three.
- All eleven CLIs respond to `--help`.
- Full pipeline run end-to-end offline on the bundled TSLA 2026-10-19 fixtures:
  entry triggered at $364.18, exit planned stop $358.32 / target $375.90 (2R),
  Time Machine 10,000 replays (4.0 % target first, 25.6 % stop first, history
  average −0.154R), budget sized 8 shares bound by the $50 max-loss limit, risk
  PASS at $46.88, broker printed the ticket and placed nothing.
- Two refusals confirmed working, not bugs: budget and broker both reject a plan
  or risk check from a date that is not today.

### It cannot place an order — checked, not assumed

- `trader-broker/ticket.py` contains **no network code at all**. It prints a
  ticket and the exact JSON; the actual call would go through Alpaca's own MCP
  server, behind Claude's Allow once / Deny card.
- Every one of the eight `urllib.request.Request` calls across the pack is a
  plain GET with headers only — no request body anywhere.
- The only outbound hosts are free public data: `query1`/`query2.finance.yahoo.com`,
  `feeds.finance.yahoo.com`, `stooq.com`, `www.nasdaqtrader.com`, `www.sec.gov`,
  `data.sec.gov`, `disclosures-clerk.house.gov`, `www.nyse.com`. No broker API
  host appears anywhere in the code.
- No API key, secret or token handling in any script.

### Setup

Needs Python 3.8+ and nothing from pip. The two SEC skills (`trader-news`,
`trader-analyst`) require an identity per SEC's fair-access policy — set
`sec_user_agent` in `trader/config.json` or the `SEC_USER_AGENT` environment
variable to `"Your Name you@example.com"`.

Copy `trader-budget/config.example.json` to `trader/config.json` and set your
own budget, max loss per trade, daily loss limit and entry window before using
`/trader-budget` or `/trader-risk` — the example values are placeholders
(\$5,000 budget, \$50 max loss) and are not a recommendation.
