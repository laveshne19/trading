"""FastAPI dashboard + control API.

Read endpoints expose live P&L, positions, risk, strategy performance, recent
signals and trades. Control endpoints (kill switch) require the ``X-API-Key``
header matching ``DASHBOARD_API_KEY``.

Run: ``uvicorn app.api.server:app --host 0.0.0.0 --port 8000``
"""
from __future__ import annotations

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import HTMLResponse

from app.config import settings
from app.db import repository
from app.logging_config import get_logger, setup_logging
from app.state import publish_state, read_state

setup_logging(settings.log_level)
logger = get_logger(__name__)

app = FastAPI(title="Zerodha Kite Trading Dashboard", version="1.0.0")


def require_api_key(x_api_key: str = Header(default="")) -> None:
    if x_api_key != settings.dashboard_api_key:
        raise HTTPException(status_code=401, detail="invalid API key")


# --- read endpoints --------------------------------------------------------
@app.get("/health")
def health() -> dict:
    return {"status": "ok", "broker": settings.broker.value, "dry_run": settings.dry_run}


@app.get("/api/state")
def get_state() -> dict:
    """Live runtime snapshot published by the orchestrator."""
    return read_state() or {"status": "no data — orchestrator not running"}


@app.get("/api/positions")
def positions() -> dict:
    state = read_state()
    return {"positions": state.get("positions", [])}


@app.get("/api/trades/today")
def trades_today() -> dict:
    rows = repository.get_today_trades()
    return {
        "trades": [
            {
                "symbol": r.tradingsymbol,
                "strategy": r.strategy,
                "side": r.side,
                "qty": r.quantity,
                "entry": r.entry_price,
                "exit": r.exit_price,
                "net_pnl": r.net_pnl,
                "status": r.status,
                "reason": r.exit_reason,
            }
            for r in rows
        ]
    }


@app.get("/api/strategies")
def strategies() -> dict:
    return {"performance": repository.strategy_performance()}


@app.get("/api/signals")
def signals(limit: int = 50) -> dict:
    rows = repository.get_recent_signals(limit)
    return {
        "signals": [
            {
                "time": r.created_at.isoformat(),
                "symbol": r.tradingsymbol,
                "strategy": r.strategy,
                "side": r.side,
                "score": r.opportunity_score,
                "ml_confidence": r.ml_confidence,
                "reward_risk": r.reward_risk,
                "acted": r.acted_upon,
            }
            for r in rows
        ]
    }


# --- control endpoints -----------------------------------------------------
@app.post("/api/kill-switch", dependencies=[Depends(require_api_key)])
def kill_switch() -> dict:
    """Request the orchestrator to engage the kill switch on its next cycle."""
    state = read_state()
    state["kill_switch_requested"] = True
    publish_state(state)
    logger.critical("Kill switch requested via dashboard")
    return {"status": "kill switch requested"}


# --- HTML dashboard --------------------------------------------------------
@app.get("/", response_class=HTMLResponse)
def index() -> str:
    return _DASHBOARD_HTML


_DASHBOARD_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Kite Trading Dashboard</title>
<style>
  :root { --bg:#0b0e14; --card:#151a23; --fg:#e6e6e6; --muted:#8b95a7;
          --green:#22c55e; --red:#ef4444; --accent:#3b82f6; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:system-ui,Segoe UI,Roboto,sans-serif;
         background:var(--bg); color:var(--fg); }
  header { padding:16px 24px; border-bottom:1px solid #222; display:flex;
           justify-content:space-between; align-items:center; }
  h1 { font-size:18px; margin:0; }
  .badge { padding:2px 8px; border-radius:8px; font-size:12px; background:#222; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
          gap:12px; padding:24px; }
  .card { background:var(--card); border:1px solid #222; border-radius:12px; padding:16px; }
  .card .label { color:var(--muted); font-size:12px; text-transform:uppercase; }
  .card .value { font-size:24px; font-weight:600; margin-top:6px; }
  .pos, .neg { font-variant-numeric:tabular-nums; }
  .pos { color:var(--green); } .neg { color:var(--red); }
  section { padding:0 24px 24px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th,td { text-align:left; padding:8px; border-bottom:1px solid #1f2530; }
  th { color:var(--muted); font-weight:500; }
  h2 { font-size:14px; color:var(--muted); text-transform:uppercase; }
</style>
</head>
<body>
<header>
  <h1>⚡ Kite Automated Trading</h1>
  <span class="badge" id="mode">loading…</span>
</header>
<div class="grid" id="kpis"></div>
<section><h2>Open Positions</h2><table id="positions"><thead><tr>
  <th>Symbol</th><th>Side</th><th>Qty</th><th>Entry</th><th>LTP</th><th>P&L</th></tr></thead>
  <tbody></tbody></table></section>
<section><h2>Today's Trades</h2><table id="trades"><thead><tr>
  <th>Symbol</th><th>Strategy</th><th>Side</th><th>Qty</th><th>Net P&L</th><th>Status</th></tr></thead>
  <tbody></tbody></table></section>
<section><h2>Strategy Performance</h2><table id="strategies"><thead><tr>
  <th>Strategy</th><th>Trades</th><th>Win %</th><th>Net P&L</th></tr></thead>
  <tbody></tbody></table></section>
<section><h2>Recent Signals</h2><table id="signals"><thead><tr>
  <th>Time</th><th>Symbol</th><th>Strategy</th><th>Side</th><th>Score</th><th>Acted</th></tr></thead>
  <tbody></tbody></table></section>
<script>
const fmt = n => (n==null?'-':Number(n).toLocaleString('en-IN',{maximumFractionDigits:2}));
const cls = n => Number(n)>=0 ? 'pos' : 'neg';
function kpi(label,value,klass=''){return `<div class="card"><div class="label">${label}</div>
  <div class="value ${klass}">${value}</div></div>`;}
async function refresh(){
  try {
    const s = await (await fetch('/api/state')).json();
    document.getElementById('mode').textContent =
      `${s.broker||'?'} ${s.dry_run?'(dry-run)':''} ${s.kill_switch?'· KILL':''}`;
    const r = s.risk||{};
    document.getElementById('kpis').innerHTML =
      kpi('Equity','₹'+fmt(r.equity)) +
      kpi('Realized Today','₹'+fmt(r.realized_today), cls(r.realized_today)) +
      kpi('Unrealized','₹'+fmt(s.unrealized_pnl), cls(s.unrealized_pnl)) +
      kpi('Open Positions',(r.open_positions??'-')) +
      kpi('Drawdown',(r.drawdown_pct??0)+'%') +
      kpi('Daily Loss',(r.daily_loss_pct??0)+'%');
    const pos = s.positions||[];
    document.querySelector('#positions tbody').innerHTML = pos.map(p=>`<tr>
      <td>${p.symbol}</td><td>${p.side}</td><td>${p.qty}</td><td>${fmt(p.entry)}</td>
      <td>${fmt(p.ltp)}</td><td class="${cls(p.pnl)}">₹${fmt(p.pnl)}</td></tr>`).join('')
      || '<tr><td colspan=6 style="color:#8b95a7">No open positions</td></tr>';
    const t = await (await fetch('/api/trades/today')).json();
    document.querySelector('#trades tbody').innerHTML = (t.trades||[]).map(x=>`<tr>
      <td>${x.symbol}</td><td>${x.strategy}</td><td>${x.side}</td><td>${x.qty}</td>
      <td class="${cls(x.net_pnl)}">₹${fmt(x.net_pnl)}</td><td>${x.status}</td></tr>`).join('')
      || '<tr><td colspan=6 style="color:#8b95a7">No trades yet</td></tr>';
    const st = await (await fetch('/api/strategies')).json();
    document.querySelector('#strategies tbody').innerHTML = (st.performance||[]).map(x=>`<tr>
      <td>${x.strategy}</td><td>${x.trades}</td><td>${fmt(x.win_rate)}%</td>
      <td class="${cls(x.net_pnl)}">₹${fmt(x.net_pnl)}</td></tr>`).join('')
      || '<tr><td colspan=4 style="color:#8b95a7">No data</td></tr>';
    const sg = await (await fetch('/api/signals?limit=20')).json();
    document.querySelector('#signals tbody').innerHTML = (sg.signals||[]).map(x=>`<tr>
      <td>${(x.time||'').replace('T',' ').slice(0,19)}</td><td>${x.symbol}</td>
      <td>${x.strategy}</td><td>${x.side}</td><td>${fmt(x.score)}</td>
      <td>${x.acted?'✅':'—'}</td></tr>`).join('')
      || '<tr><td colspan=6 style="color:#8b95a7">No signals</td></tr>';
  } catch(e){ console.error(e); }
}
refresh(); setInterval(refresh, 3000);
</script>
</body>
</html>
"""
