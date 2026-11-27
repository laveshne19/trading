"""Execution engine. Rules enforced here:
 * an API call succeeding or failing never proves an order's state: we ask the broker and record the answer
 * an ambiguous submit (timeout) is resolved by looking the order up by client reference, never by re-sending
 * every entry gets a protective stop; no stop means immediate flatten and a lock
 * stops are only tightened, and a stop is replaced (new one validated first) never removed
 * after every exit the broker's actual position is checked
"""
from __future__ import annotations
import hashlib
from datetime import datetime

from .broker import Broker, BrokerError, BrokerRejected, BrokerTimeout
from .config import BotConfig, live_gate
from .costs import equity_intraday_costs, options_costs
from .ledger import Ledger
from .risk import RiskEngine, Signal


class Unresolved(Exception):
    """Order state could not be determined; bot is locked until reconciled."""


def make_key(*parts) -> str:
    return hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()[:24]


def _opp(side: str) -> str:
    return "SELL" if side == "BUY" else "BUY"


class ExecutionEngine:
    def __init__(self, cfg: BotConfig, broker: Broker, ledger: Ledger, risk: RiskEngine, max_polls: int = 3):
        self.cfg, self.broker, self.ledger, self.risk, self.max_polls = cfg, broker, ledger, risk, max_polls

    # ---- low level -------------------------------------------------
    def _submit(self, key: str, **order) -> str | None:
        """Place an order whose intent is already in the ledger. Returns broker id or None if definitively not placed."""
        try:
            bid = self.broker.place_order(client_ref=key, **order)
        except BrokerRejected as ex:           # includes RateLimited: definitively not placed
            self.ledger.update(key, status="REJECTED", reject_reason=str(ex))
            return None
        except (BrokerTimeout, BrokerError):   # ambiguous: look up, do NOT re-send
            return self._resolve_unknown(key)
        self.ledger.update(key, status="SUBMITTED", broker_order_id=bid)
        return bid

    def _resolve_unknown(self, key: str) -> str | None:
        try:
            found = self.broker.find_order_by_ref(key)
        except BrokerError:
            self.ledger.update(key, status="SUBMITTED")  # keep non-terminal; it may exist
            self.ledger.event("order_state_unknown", key=key)
            self.risk.lock("RECON", f"order state unknown for {key}")
            raise Unresolved(key)
        if found is None:
            self.ledger.update(key, status="NOT_PLACED", reject_reason="not found at broker after timeout")
            return None
        self.ledger.update(key, status="SUBMITTED", broker_order_id=found.broker_order_id)
        self.ledger.event("order_adopted_after_timeout", key=key, broker_order_id=found.broker_order_id)
        return found.broker_order_id

    def _await_fill(self, key: str, bid: str):
        """Poll, then cancel any unfilled remainder, then read the final state from the broker."""
        o = None
        for _ in range(self.max_polls):
            o = self.broker.get_order(bid)
            if o.status in ("FILLED", "REJECTED", "CANCELLED"):
                break
        if o.status not in ("FILLED", "REJECTED", "CANCELLED"):
            try:
                self.broker.cancel_order(bid)
            except BrokerError:
                pass
            o = self.broker.get_order(bid)
        self.ledger.update(key, status=o.status, filled_qty=o.filled_qty, avg_price=o.avg_price)
        return o

    def _costs(self, segment, buy_v, sell_v):
        f = options_costs if segment == "FNO" else equity_intraday_costs
        return f(buy_v, sell_v)["total"]

    # ---- entry -----------------------------------------------------
    def submit_entry(self, s: Signal, now: datetime) -> dict:
        c = self.cfg
        if not c.enabled:
            return {"status": "REJECTED", "reasons": ["bot disabled"]}
        if c.mode not in ("PAPER", "LIVE"):
            self.ledger.event("research_signal", symbol=s.symbol, strategy=s.strategy, signal_id=s.signal_id)
            return {"status": "RESEARCH_ONLY"}
        if c.mode == "LIVE":
            ok, why = live_gate(c)
            if not ok:
                return {"status": "REJECTED", "reasons": why}
        dec = self.risk.check_entry(s, now)
        if not dec.approved:
            self.ledger.event("entry_rejected", symbol=s.symbol, reasons=dec.reasons)
            return {"status": "REJECTED", "reasons": dec.reasons}

        key = make_key(s.strategy, s.symbol, s.side, s.signal_id)
        row, created = self.ledger.register_intent(key, s.symbol, s.side, dec.qty, "MARKET", "ENTRY",
                                                   meta={"stop": s.stop, "target": s.target})
        if not created:
            return {"status": "DUPLICATE", "order": row}

        need = dec.qty * s.entry / self.cfg.risk.max_leverage
        if self.broker.get_funds() < need:
            self.ledger.update(key, status="REJECTED", reject_reason="insufficient funds")
            return {"status": "REJECTED", "reasons": ["insufficient funds"]}

        try:
            bid = self._submit(key, symbol=s.symbol, side=s.side, qty=dec.qty, order_type="MARKET",
                               product="MIS" if s.segment == "CASH" else "NRML")
        except Unresolved:
            return {"status": "UNRESOLVED"}
        if bid is None:
            return {"status": "NOT_PLACED"}

        o = self._await_fill(key, bid)
        if o.filled_qty == 0:
            return {"status": "NO_FILL", "broker_status": o.status}

        stop_key = make_key(key, "SL")
        self.ledger.open_trade(key, s.symbol, s.side, o.filled_qty, o.avg_price, s.stop, s.target,
                               s.strategy, s.segment, stop_key)
        self.risk.record_open(s.symbol, o.filled_qty * o.avg_price, s.sector, o.filled_qty * abs(o.avg_price - s.stop))

        if not self._place_stop(stop_key, key, s.symbol, _opp(s.side), o.filled_qty, s.stop):
            self.ledger.event("stop_placement_failed", symbol=s.symbol)
            self.risk.lock("STOPFAIL", f"could not protect {s.symbol}; flattening")
            self.exit_position(s.symbol, "STOP_PLACEMENT_FAILED", now, _skip_stop_cancel=True)
            return {"status": "ENTERED_NO_STOP_FLATTENED"}
        return {"status": "ENTERED", "qty": o.filled_qty, "avg": o.avg_price, "partial": o.filled_qty < dec.qty}

    def _place_stop(self, stop_key, parent, symbol, side, qty, trigger) -> bool:
        self.ledger.register_intent(stop_key, symbol, side, qty, "SL_M", "STOP", trigger=trigger, parent=parent)
        try:
            bid = self._submit(stop_key, symbol=symbol, side=side, qty=qty, order_type="SL_M",
                               product="MIS", trigger=trigger)
        except Unresolved:
            return False
        if bid is None:
            return False
        st = self.broker.get_order(bid)
        if st.status != "OPEN":
            self.ledger.update(stop_key, status=st.status)
            return False
        return True

    # ---- stop management ------------------------------------------
    def trail_stop(self, symbol: str, new_stop: float) -> dict:
        t = self.ledger.get_open_trade(symbol)
        if not t:
            return {"status": "NO_POSITION"}
        ltp = self.broker.get_ltp(symbol)
        long_ = t["side"] == "BUY"
        if (long_ and not (t["stop"] < new_stop < ltp)) or ((not long_) and not (ltp < new_stop < t["stop"])):
            return {"status": "REJECTED", "reason": "stop may only tighten and must stay on the correct side of price"}
        n = len(self.ledger.orders(role="STOP")) + 1
        new_key = make_key(t["trade_id"], "SL", n)
        if not self._place_stop(new_key, t["trade_id"], symbol, _opp(t["side"]), t["qty"], new_stop):
            return {"status": "TRAIL_FAILED_KEPT_OLD"}
        old = self.ledger.get(t["stop_key"])
        try:
            if old and old["broker_order_id"]:
                self.broker.cancel_order(old["broker_order_id"])
            if old:
                self.ledger.update(old["idem_key"], status="CANCELLED")
        except BrokerError:
            self.ledger.event("old_stop_cancel_failed", symbol=symbol)
            self.risk.lock("RECON", f"two live stops on {symbol}")
        self.ledger.update_trade(t["trade_id"], stop=new_stop, stop_key=new_key)
        return {"status": "TRAILED", "stop": new_stop}

    # ---- exit ------------------------------------------------------
    def exit_position(self, symbol: str, reason: str, now: datetime, _skip_stop_cancel: bool = False) -> dict:
        t = self.ledger.get_open_trade(symbol)
        if not t:
            return {"status": "NO_POSITION"}
        key = make_key(t["trade_id"], "EXIT")
        row, created = self.ledger.register_intent(key, symbol, _opp(t["side"]), t["qty"], "MARKET", "EXIT",
                                                   parent=t["trade_id"], meta={"reason": reason})
        if not created and row["status"] not in ("REJECTED", "NOT_PLACED", "CANCELLED"):
            return {"status": "DUPLICATE_EXIT"}
        if not created:  # previous attempt definitively failed: allow a fresh, distinct attempt
            key = make_key(t["trade_id"], "EXIT", len(self.ledger.orders(role="EXIT")) + 1)
            self.ledger.register_intent(key, symbol, _opp(t["side"]), t["qty"], "MARKET", "EXIT",
                                        parent=t["trade_id"], meta={"reason": reason})
        try:
            bid = self._submit(key, symbol=symbol, side=_opp(t["side"]), qty=t["qty"], order_type="MARKET",
                               product="MIS" if t["segment"] == "CASH" else "NRML")
        except Unresolved:
            return {"status": "UNRESOLVED"}
        if bid is None:
            self.risk.lock("RECON", f"exit failed for {symbol}; stop remains")
            return {"status": "EXIT_NOT_PLACED"}
        o = self._await_fill(key, bid)

        if o.filled_qty < t["qty"]:   # partial exit: remainder still protected by the old stop; resize it
            remaining = t["qty"] - o.filled_qty
            self.ledger.update_trade(t["trade_id"], qty=remaining)
            self.ledger.event("partial_exit", symbol=symbol, remaining=remaining)
            self.risk.lock("RECON", f"partial exit on {symbol}")
            return {"status": "PARTIAL_EXIT", "remaining": remaining}

        if not _skip_stop_cancel:
            st = self.ledger.get(t["stop_key"])
            if st and st["broker_order_id"] and st["status"] not in ("FILLED", "CANCELLED"):
                try:
                    self.broker.cancel_order(st["broker_order_id"])
                    self.ledger.update(st["idem_key"], status="CANCELLED")
                except BrokerError:
                    self.ledger.event("stop_cancel_failed_after_exit", symbol=symbol)
        actual = self.broker.get_positions().get(symbol, 0)
        if actual != 0:
            self.ledger.event("position_mismatch_after_exit", symbol=symbol, actual=actual)
            self.risk.lock("RECON", f"{symbol} position {actual} after exit")
            return {"status": "EXIT_MISMATCH", "actual": actual}
        return self._close_trade(t, o.avg_price, reason, now)

    def _close_trade(self, t, exit_avg, reason, now) -> dict:
        sgn = 1 if t["side"] == "BUY" else -1
        gross = round((exit_avg - t["entry_avg"]) * t["qty"] * sgn, 2)
        buy_v = (t["entry_avg"] if sgn == 1 else exit_avg) * t["qty"]
        sell_v = (exit_avg if sgn == 1 else t["entry_avg"]) * t["qty"]
        costs = round(self._costs(t["segment"], buy_v, sell_v), 2)
        net = round(gross - costs, 2)
        self.ledger.close_trade(t["trade_id"], exit_avg, gross, costs, net, reason)
        self.risk.record_close(t["symbol"], net, now)
        return {"status": "EXITED", "gross": gross, "costs": costs, "net": net, "reason": reason}

    # ---- periodic sync: detect stops that fired at the broker -----
    def sync(self, now: datetime) -> list:
        out = []
        for t in self.ledger.open_trades():
            st = self.ledger.get(t["stop_key"])
            if not st or not st["broker_order_id"]:
                continue
            o = self.broker.get_order(st["broker_order_id"])
            if o.status == "FILLED":
                self.ledger.update(st["idem_key"], status="FILLED", filled_qty=o.filled_qty, avg_price=o.avg_price)
                if self.broker.get_positions().get(t["symbol"], 0) != 0:
                    self.risk.lock("RECON", f"{t['symbol']} position not flat after stop fill")
                out.append(self._close_trade(t, o.avg_price, "STOP_HIT", now))
        return out

    # ---- emergency -------------------------------------------------
    def kill(self, reason: str, now: datetime) -> dict:
        """Independent of strategies: lock, cancel unfilled entries, flatten, then verify."""
        self.risk.lock("MANUAL", f"kill: {reason}")
        for o in self.ledger.orders(role="ENTRY", active_only=True):
            if o["broker_order_id"]:
                try:
                    self.broker.cancel_order(o["broker_order_id"])
                    self.ledger.update(o["idem_key"], status="CANCELLED")
                except BrokerError:
                    pass
        results = {t["symbol"]: self.exit_position(t["symbol"], f"KILL:{reason}", now) for t in self.ledger.open_trades()}
        self.ledger.event("kill_executed", reason=reason, results=results)
        return results
