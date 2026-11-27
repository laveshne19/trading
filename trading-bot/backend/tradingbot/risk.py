"""Risk engine: the last gate before any order. Independent of strategies and AI."""
from __future__ import annotations
import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from .config import BotConfig, validate


@dataclass
class Signal:
    signal_id: str
    strategy: str
    symbol: str
    side: str                 # BUY or SELL
    entry: float
    stop: float
    target: float
    sector: str = "UNKNOWN"
    segment: str = "CASH"
    lot_size: int = 1
    bid: Optional[float] = None
    ask: Optional[float] = None


@dataclass
class Decision:
    approved: bool
    qty: int = 0
    risk_amount: float = 0.0
    reasons: list = field(default_factory=list)


def position_size(capital: float, risk_pct: float, entry: float, stop: float, lot_size: int = 1) -> int:
    """Quantity so that a stop-out loses at most risk_pct of capital. Rounded DOWN to lots."""
    if capital <= 0 or risk_pct <= 0 or entry <= 0 or stop <= 0 or lot_size < 1:
        raise ValueError("invalid sizing inputs")
    per_unit = abs(entry - stop)
    if per_unit == 0:
        raise ValueError("entry equals stop")
    lots = math.floor((capital * risk_pct / 100.0) / per_unit / lot_size)
    return max(lots, 0) * lot_size


def _minutes(now: datetime) -> int:
    return now.hour * 60 + now.minute


def _hhmm(s: str) -> int:
    h, m = s.split(":")
    return int(h) * 60 + int(m)


class RiskEngine:
    def __init__(self, cfg: BotConfig):
        self.cfg = cfg
        self.day = None
        self.week = None
        self.realized_today = 0.0
        self.realized_week = 0.0
        self.unrealized = 0.0
        self.consec_losses = 0
        self.trades_today = 0
        self.open: dict = {}          # symbol -> {"notional","sector","risk"}
        self.lock_kind: Optional[str] = None
        self.lock_reason: Optional[str] = None

    # ---- state -------------------------------------------------------
    def roll(self, now: datetime):
        d, wk = now.date(), now.isocalendar()[:2]
        if self.day != d:
            self.day = d
            self.realized_today = 0.0
            self.trades_today = 0
            self.consec_losses = 0
            if self.lock_kind in ("DAILY", "CONSEC"):
                self.lock_kind = self.lock_reason = None
        if self.week != wk:
            self.week = wk
            self.realized_week = 0.0
            if self.lock_kind == "WEEKLY":
                self.lock_kind = self.lock_reason = None

    def lock(self, kind: str, reason: str):
        # first lock wins so the original cause is preserved
        if self.lock_kind is None:
            self.lock_kind, self.lock_reason = kind, reason

    def unlock(self, approved_by: str):
        """Only manual/recon/stop-failure locks need an explicit human unlock."""
        if not approved_by or not approved_by.strip():
            raise ValueError("unlock requires approved_by")
        self.lock_kind = self.lock_reason = None

    def daily_pnl(self) -> float:
        return self.realized_today + self.unrealized

    def update_unrealized(self, pnl: float, now: datetime):
        self.roll(now)
        self.unrealized = pnl
        self._check_loss_limits()

    def _check_loss_limits(self):
        cap = self.cfg.risk.capital
        if cap is None:
            return
        if self.daily_pnl() <= -cap * self.cfg.risk.max_daily_loss_pct / 100:
            self.lock("DAILY", "max daily loss reached")
        if self.realized_week + self.unrealized <= -cap * self.cfg.risk.max_weekly_loss_pct / 100:
            self.lock("WEEKLY", "max weekly loss reached")

    def record_open(self, symbol: str, notional: float, sector: str, risk: float):
        self.open[symbol] = {"notional": notional, "sector": sector, "risk": risk}
        self.trades_today += 1

    def record_close(self, symbol: str, net_pnl: float, now: datetime):
        self.roll(now)
        self.open.pop(symbol, None)
        self.realized_today += net_pnl
        self.realized_week += net_pnl
        self.consec_losses = self.consec_losses + 1 if net_pnl < 0 else 0
        if self.consec_losses >= self.cfg.risk.max_consecutive_losses:
            self.lock("CONSEC", f"{self.consec_losses} consecutive losses")
        self._check_loss_limits()

    # ---- the gate ----------------------------------------------------
    def check_entry(self, s: Signal, now: datetime) -> Decision:
        self.roll(now)
        c, r = self.cfg, self.cfg.risk
        errs, _ = validate(c)
        if errs:
            return Decision(False, reasons=["config invalid: " + "; ".join(errs)])
        if c.kill_switch:
            return Decision(False, reasons=["kill switch active"])
        self._check_loss_limits()
        if self.lock_kind:
            return Decision(False, reasons=[f"bot locked ({self.lock_kind}): {self.lock_reason}"])

        why = []
        if s.side not in ("BUY", "SELL"):
            return Decision(False, reasons=["invalid side"])
        if s.segment not in c.allowed_segments:
            why.append(f"segment {s.segment} not allowed")
        if s.segment == "FNO" and not c.options_enabled:
            why.append("options/F&O disabled")
        m = _minutes(now)
        if not (_hhmm(c.trading_start) <= m <= _hhmm(c.last_entry)):
            why.append("outside entry window")

        if min(s.entry, s.stop, s.target) <= 0:
            return Decision(False, reasons=why + ["non-positive price"])
        long_ = s.side == "BUY"
        if long_ and not (s.stop < s.entry < s.target):
            why.append("BUY needs stop < entry < target")
        if (not long_) and not (s.stop > s.entry > s.target):
            why.append("SELL needs stop > entry > target")
        if why and any("needs stop" in x for x in why):
            return Decision(False, reasons=why)
        risk_per_unit = abs(s.entry - s.stop)
        rr = abs(s.target - s.entry) / risk_per_unit
        if rr < r.min_risk_reward:
            why.append(f"risk/reward {rr:.2f} < {r.min_risk_reward}")
        if s.bid and s.ask and s.ask >= s.bid > 0:
            spread = (s.ask - s.bid) / ((s.ask + s.bid) / 2) * 100
            if spread > r.max_spread_pct:
                why.append(f"spread {spread:.2f}% > {r.max_spread_pct}%")
        if s.symbol in self.open:
            why.append("already in this symbol")
        if len(self.open) >= r.max_open_positions:
            why.append("max open positions")
        if self.trades_today >= r.max_trades_per_day:
            why.append("max trades per day")

        qty = 0
        try:
            qty = position_size(r.capital, r.risk_per_trade_pct, s.entry, s.stop, s.lot_size)
        except ValueError as ex:
            why.append(str(ex))
        if qty > 0:
            per_pos_cap = math.floor(r.capital * r.max_position_pct / 100 / s.entry / s.lot_size) * s.lot_size
            qty = min(qty, per_pos_cap)
        if qty < max(s.lot_size, 1):
            why.append("size too small after limits")
        else:
            notional = qty * s.entry
            if notional > r.capital * r.max_leverage:
                why.append("exceeds leverage limit")
            total = sum(p["notional"] for p in self.open.values()) + notional
            if total > r.capital * r.max_total_allocation_pct / 100:
                why.append("exceeds total allocation limit")
            sector = sum(p["notional"] for p in self.open.values() if p["sector"] == s.sector) + notional
            if sector > r.capital * r.max_sector_exposure_pct / 100:
                why.append(f"exceeds sector exposure for {s.sector}")
        if why:
            return Decision(False, reasons=why)
        return Decision(True, qty=qty, risk_amount=qty * risk_per_unit, reasons=["approved"])
