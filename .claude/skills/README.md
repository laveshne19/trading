# Indian Trading Skills

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
