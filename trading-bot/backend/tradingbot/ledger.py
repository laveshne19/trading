"""Append-only execution ledger (SQLite). Source of truth for what the bot intended and what filled."""
from __future__ import annotations
import json
import sqlite3
import time

TERMINAL = {"FILLED", "REJECTED", "CANCELLED", "NOT_PLACED"}
_UPDATABLE = {"status", "broker_order_id", "filled_qty", "avg_price", "reject_reason", "qty", "price", "trigger"}


class Ledger:
    def __init__(self, path: str = ":memory:"):
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS orders(
          idem_key TEXT PRIMARY KEY, symbol TEXT, side TEXT, qty INTEGER, order_type TEXT, role TEXT,
          price REAL, trigger REAL, parent TEXT, broker_order_id TEXT, status TEXT,
          filled_qty INTEGER DEFAULT 0, avg_price REAL, reject_reason TEXT, meta TEXT, ts REAL);
        CREATE TABLE IF NOT EXISTS trades(
          trade_id TEXT PRIMARY KEY, symbol TEXT, side TEXT, qty INTEGER, entry_avg REAL, stop REAL,
          target REAL, strategy TEXT, segment TEXT, stop_key TEXT, status TEXT, exit_avg REAL,
          gross REAL, costs REAL, net REAL, exit_reason TEXT, opened REAL, closed REAL);
        CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, kind TEXT, data TEXT);
        """)

    def close(self):
        try:
            self.db.close()
        except Exception:
            pass

    def __del__(self):
        self.close()

    def event(self, kind: str, **data):
        self.db.execute("INSERT INTO events(ts,kind,data) VALUES(?,?,?)", (time.time(), kind, json.dumps(data, default=str)))
        self.db.commit()

    def events(self, kind: str | None = None):
        q = "SELECT * FROM events" + (" WHERE kind=?" if kind else "") + " ORDER BY id"
        return [dict(r) for r in self.db.execute(q, (kind,) if kind else ())]

    # ---- orders ----
    def register_intent(self, idem_key, symbol, side, qty, order_type, role, price=None, trigger=None,
                        parent=None, meta=None):
        """Insert once. Returns (row, created). A duplicate idem_key never creates a second order."""
        cur = self.db.execute(
            "INSERT OR IGNORE INTO orders(idem_key,symbol,side,qty,order_type,role,price,trigger,parent,status,meta,ts)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (idem_key, symbol, side, qty, order_type, role, price, trigger, parent, "INTENT",
             json.dumps(meta or {}), time.time()))
        self.db.commit()
        return self.get(idem_key), cur.rowcount == 1

    def get(self, idem_key):
        r = self.db.execute("SELECT * FROM orders WHERE idem_key=?", (idem_key,)).fetchone()
        return dict(r) if r else None

    def update(self, idem_key, **kw):
        bad = set(kw) - _UPDATABLE
        if bad:
            raise ValueError(f"not updatable: {bad}")
        sets = ",".join(f"{k}=?" for k in kw)
        self.db.execute(f"UPDATE orders SET {sets} WHERE idem_key=?", (*kw.values(), idem_key))
        self.db.commit()

    def orders(self, role=None, active_only=False):
        rows = [dict(r) for r in self.db.execute("SELECT * FROM orders ORDER BY ts")]
        if role:
            rows = [r for r in rows if r["role"] == role]
        if active_only:
            rows = [r for r in rows if r["status"] not in TERMINAL]
        return rows

    def net_positions(self) -> dict:
        pos: dict = {}
        for r in self.db.execute("SELECT symbol, side, filled_qty FROM orders WHERE filled_qty>0"):
            pos[r["symbol"]] = pos.get(r["symbol"], 0) + (r["filled_qty"] if r["side"] == "BUY" else -r["filled_qty"])
        return {k: v for k, v in pos.items() if v != 0}

    def ever_traded(self) -> set:
        return {r["symbol"] for r in self.db.execute("SELECT DISTINCT symbol FROM orders")}

    # ---- trades ----
    def open_trade(self, trade_id, symbol, side, qty, entry_avg, stop, target, strategy, segment, stop_key):
        self.db.execute(
            "INSERT INTO trades(trade_id,symbol,side,qty,entry_avg,stop,target,strategy,segment,stop_key,status,opened)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,'OPEN',?)",
            (trade_id, symbol, side, qty, entry_avg, stop, target, strategy, segment, stop_key, time.time()))
        self.db.commit()

    def get_open_trade(self, symbol):
        r = self.db.execute("SELECT * FROM trades WHERE symbol=? AND status='OPEN'", (symbol,)).fetchone()
        return dict(r) if r else None

    def open_trades(self):
        return [dict(r) for r in self.db.execute("SELECT * FROM trades WHERE status='OPEN'")]

    def update_trade(self, trade_id, **kw):
        sets = ",".join(f"{k}=?" for k in kw)
        self.db.execute(f"UPDATE trades SET {sets} WHERE trade_id=?", (*kw.values(), trade_id))
        self.db.commit()

    def close_trade(self, trade_id, exit_avg, gross, costs, net, reason):
        self.db.execute(
            "UPDATE trades SET status='CLOSED',exit_avg=?,gross=?,costs=?,net=?,exit_reason=?,closed=? WHERE trade_id=?",
            (exit_avg, gross, costs, net, reason, time.time(), trade_id))
        self.db.commit()
