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
