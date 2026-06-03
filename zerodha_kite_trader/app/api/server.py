"""FastAPI dashboard + control API.

The whole dashboard is behind a username/password login (configurable, can be
disabled with ``DASHBOARD_AUTH_ENABLED=false``). Read endpoints expose live
P&L, positions, risk, strategy performance, recent signals and trades. The
kill-switch control endpoint additionally accepts the ``X-API-Key`` header for
programmatic use.

Run: ``uvicorn app.api.server:app --host 0.0.0.0 --port 8000``
"""
from __future__ import annotations

from fastapi import Cookie, Depends, FastAPI, Form, Header, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, Response

from app.api.auth import check_credentials, create_session_token, verify_session_token
from app.config import settings
from app.db import repository
from app.logging_config import audit, get_logger, setup_logging
from app.state import publish_state, read_state

setup_logging(settings.log_level)
logger = get_logger(__name__)

app = FastAPI(title="Zerodha Kite Trading Dashboard", version="1.0.0")

SESSION_COOKIE = "kite_session"


def current_user(session: str | None = Cookie(default=None, alias=SESSION_COOKIE)) -> str | None:
    """Return the logged-in username from the session cookie, or None."""
    if not settings.dashboard_auth_enabled:
        return settings.dashboard_username
    return verify_session_token(session)


def require_user(user: str | None = Depends(current_user)) -> str:
    """Dependency for JSON API endpoints: 401 when not authenticated."""
    if user is None:
        raise HTTPException(status_code=401, detail="authentication required")
    return user


def require_control(
    user: str | None = Depends(current_user),
    x_api_key: str = Header(default=""),
) -> None:
    """Control endpoints: allow a logged-in session OR a valid API key."""
    if user is not None:
        return
    if x_api_key and x_api_key == settings.dashboard_api_key:
        return
    raise HTTPException(status_code=401, detail="authentication required")


# --- read endpoints --------------------------------------------------------
@app.get("/health")
def health() -> dict:
    return {"status": "ok", "broker": settings.broker.value, "dry_run": settings.dry_run}


@app.get("/api/state")
def get_state(_user: str = Depends(require_user)) -> dict:
    """Live runtime snapshot published by the orchestrator."""
    return read_state() or {"status": "no data — orchestrator not running"}


@app.get("/api/positions")
def positions(_user: str = Depends(require_user)) -> dict:
    state = read_state()
    return {"positions": state.get("positions", [])}


@app.get("/api/trades/today")
def trades_today(_user: str = Depends(require_user)) -> dict:
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
def strategies(_user: str = Depends(require_user)) -> dict:
    return {"performance": repository.strategy_performance()}


@app.get("/api/signals")
def signals(limit: int = 50, _user: str = Depends(require_user)) -> dict:
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
@app.post("/api/kill-switch", dependencies=[Depends(require_control)])
def kill_switch() -> dict:
    """Request the orchestrator to engage the kill switch on its next cycle."""
    state = read_state()
    state["kill_switch_requested"] = True
    publish_state(state)
    logger.critical("Kill switch requested via dashboard")
    return {"status": "kill switch requested"}


# --- auth routes -----------------------------------------------------------
@app.get("/login", response_class=HTMLResponse)
def login_page(error: str = "") -> str:
    return _LOGIN_HTML.replace(
        "{{ERROR}}",
        f'<div class="err">{error}</div>' if error else "",
    )


@app.post("/login")
def login(username: str = Form(...), password: str = Form(...)) -> Response:
    if not check_credentials(username, password):
        audit(f"DASHBOARD LOGIN FAILED user={username!r}")
        return RedirectResponse(
            url="/login?error=Invalid+username+or+password", status_code=303
        )
    token = create_session_token(username)
    audit(f"DASHBOARD LOGIN OK user={username!r}")
    resp = RedirectResponse(url="/", status_code=303)
    resp.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.env.value == "production",
        max_age=12 * 3600,
    )
    return resp


@app.get("/logout")
def logout() -> Response:
    resp = RedirectResponse(url="/login", status_code=303)
    resp.delete_cookie(SESSION_COOKIE)
    return resp


# --- HTML dashboard --------------------------------------------------------
@app.get("/", response_class=HTMLResponse)
def index(user: str | None = Depends(current_user)) -> Response:
    if user is None:
        return RedirectResponse(url="/login", status_code=303)
    return HTMLResponse(_DASHBOARD_HTML)


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
  <div style="display:flex;gap:12px;align-items:center">
    <span class="badge" id="mode">loading…</span>
    <a href="/logout" style="color:#8b95a7;text-decoration:none;font-size:13px">Logout</a>
  </div>
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


_LOGIN_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Login · Kite Automated Trading</title>
<style>
  :root { --bg:#0b0e14; --card:#151a23; --fg:#e6e6e6; --muted:#8b95a7; --accent:#3b82f6; }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font-family:system-ui,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--fg); }
  .card { width:340px; background:var(--card); border:1px solid #222; border-radius:16px;
          padding:28px; }
  .logo { width:48px; height:48px; border-radius:12px; background:#1e293b; display:flex;
          align-items:center; justify-content:center; margin:0 auto 14px; font-size:24px; }
  h1 { font-size:20px; text-align:center; margin:0 0 4px; }
  .sub { text-align:center; color:var(--muted); font-size:13px; margin-bottom:20px; }
  label { display:block; font-size:11px; color:var(--muted); text-transform:uppercase;
          letter-spacing:.04em; margin:14px 0 6px; }
  input { width:100%; padding:11px 12px; border-radius:10px; border:1px solid #222;
          background:#0e131b; color:var(--fg); font-size:14px; }
  button { width:100%; margin-top:20px; padding:12px; border:0; border-radius:10px;
           background:var(--accent); color:#fff; font-size:15px; font-weight:600; cursor:pointer; }
  button:hover { background:#2f6fe0; }
  .err { margin-top:14px; padding:10px 12px; border-radius:8px; font-size:13px;
         background:#3b1d1d; color:#fca5a5; border:1px solid #7f1d1d; }
  .foot { text-align:center; color:var(--muted); font-size:11px; margin-top:18px; }
</style>
</head>
<body>
  <form class="card" method="post" action="/login">
    <div class="logo">⚡</div>
    <h1>Kite Automated Trading</h1>
    <div class="sub">Sign in to the trading dashboard</div>
    <label for="username">Username</label>
    <input id="username" name="username" autocomplete="username" autofocus required/>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required/>
    {{ERROR}}
    <button type="submit">Sign in</button>
    <div class="foot">Secured · session expires in 12h</div>
  </form>
</body>
</html>
"""
