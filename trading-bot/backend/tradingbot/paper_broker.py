"""Deterministic simulated broker with failure injection, used for paper trading and tests."""
from __future__ import annotations
import copy
from .broker import Broker, BrokerOrder, BrokerError, BrokerRejected, BrokerTimeout, RateLimited


class PaperBroker(Broker):
    def __init__(self, funds: float = 100000.0, slippage_pct: float = 0.05):
        self.funds = funds
        self.slip = slippage_pct / 100
        self.prices: dict = {}
        self.orders: dict = {}
        self.refs: dict = {}
        self.positions: dict = {}
        self._n = 0
        # failure injection (one-shot unless noted)
        self.fail_mode = None            # reject | rate_limited | timeout_accepted | timeout_lost | down
        self.partial_fraction = None     # e.g. 0.5 -> market orders fill half
        self.reject_stops = False        # persistent: refuse SL_M orders
        self.lookup_down = False         # persistent: find_order_by_ref raises
        self.cancel_fails = False        # persistent

    def set_price(self, symbol, px):
        self.prices[symbol] = px
        for o in list(self.orders.values()):
            if o.symbol == symbol and o.order_type == "SL_M" and o.status == "OPEN":
                hit = px >= o.trigger if o.side == "BUY" else px <= o.trigger
                if hit:
                    self._fill(o, px, o.qty)

    def _fill(self, o, px, qty):
        sgn = 1 if o.side == "BUY" else -1
        fill_px = round(px * (1 + sgn * self.slip), 2)
        prev_val = (o.avg_price or 0) * o.filled_qty
        o.filled_qty += qty
        o.avg_price = round((prev_val + fill_px * qty) / o.filled_qty, 4)
        o.status = "FILLED" if o.filled_qty >= o.qty else "PARTIAL"
        self.positions[o.symbol] = self.positions.get(o.symbol, 0) + sgn * qty
        self.funds -= sgn * fill_px * qty
        if self.positions[o.symbol] == 0:
            del self.positions[o.symbol]

    def place_order(self, symbol, side, qty, order_type, product, price=None, trigger=None, client_ref=None):
        mode, self.fail_mode = self.fail_mode, None
        if mode == "down":
            raise BrokerError("connection refused")
        if mode == "rate_limited":
            raise RateLimited("429")
        if mode == "reject":
            raise BrokerRejected("rejected by broker")
        if mode == "timeout_lost":
            raise BrokerTimeout("timed out before reaching broker")
        if order_type == "SL_M" and self.reject_stops:
            raise BrokerRejected("stop orders refused")
        if client_ref and client_ref in self.refs:
            raise BrokerRejected("duplicate order reference")
        if symbol not in self.prices:
            raise BrokerRejected("no price for symbol")
        self._n += 1
        oid = f"P{self._n:06d}"
        o = BrokerOrder(oid, symbol, side, qty, order_type, "OPEN", price=price, trigger=trigger, client_ref=client_ref)
        self.orders[oid] = o
        if client_ref:
            self.refs[client_ref] = oid
        if order_type == "MARKET":
            q = qty if not self.partial_fraction else max(1, int(qty * self.partial_fraction))
            self._fill(o, self.prices[symbol], q)
        if mode == "timeout_accepted":
            raise BrokerTimeout("response lost after acceptance")
        return oid

    def get_order(self, oid):
        if oid not in self.orders:
            raise BrokerError("unknown order")
        return copy.copy(self.orders[oid])

    def find_order_by_ref(self, ref):
        if self.lookup_down:
            raise BrokerError("order lookup unavailable")
        oid = self.refs.get(ref)
        return copy.copy(self.orders[oid]) if oid else None

    def cancel_order(self, oid):
        if self.cancel_fails:
            raise BrokerError("cancel failed")
        o = self.orders[oid]
        if o.status == "FILLED":
            raise BrokerError("already filled")
        if o.status in ("OPEN", "PARTIAL"):
            o.status = "CANCELLED" if o.filled_qty == 0 else "PARTIAL_CANCELLED"
            if o.status == "PARTIAL_CANCELLED":
                o.status = "CANCELLED"

    def get_positions(self):
        return dict(self.positions)

    def get_ltp(self, symbol):
        return self.prices[symbol]

    def get_funds(self):
        return self.funds
