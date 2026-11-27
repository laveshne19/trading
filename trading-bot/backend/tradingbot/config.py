"""Configuration with strict validation. Unknown keys are errors, never ignored."""
from __future__ import annotations
import json
from dataclasses import dataclass, field, asdict, fields
from typing import Optional

MODES = ("RESEARCH", "PAPER", "LIVE")


class ConfigError(ValueError):
    pass


@dataclass
class RiskConfig:
    capital: Optional[float] = None          # REQUIRED INPUT (never assumed)
    risk_per_trade_pct: float = 0.5
    max_daily_loss_pct: float = 1.5
    max_weekly_loss_pct: float = 3.0
    max_open_positions: int = 3
    min_risk_reward: float = 2.0
    max_consecutive_losses: int = 3
    max_trades_per_day: int = 6
    max_position_pct: float = 20.0           # one position's notional / capital
    max_total_allocation_pct: float = 60.0   # all open notional / capital
    max_sector_exposure_pct: float = 35.0
    max_leverage: float = 1.0
    max_spread_pct: float = 0.30


@dataclass
class BotConfig:
    mode: str = "RESEARCH"
    enabled: bool = False
    kill_switch: bool = False
    live_confirmed: bool = False             # explicit user activation, never automatic
    paper_sessions_completed: int = 0
    required_paper_sessions: int = 30
    trading_start: str = "09:30"
    last_entry: str = "14:45"
    square_off: str = "15:15"
    allowed_segments: list = field(default_factory=lambda: ["CASH"])
    options_enabled: bool = False
    strict_account_scope: bool = False
    risk: RiskConfig = field(default_factory=RiskConfig)

    @classmethod
    def from_dict(cls, d: dict) -> "BotConfig":
        d = dict(d)
        risk_d = d.pop("risk", {})
        top = {f.name for f in fields(cls)} - {"risk"}
        unknown = set(d) - top
        r_known = {f.name for f in fields(RiskConfig)}
        unknown_r = set(risk_d) - r_known
        if unknown or unknown_r:
            raise ConfigError(f"unknown config keys: {sorted(unknown | {'risk.'+k for k in unknown_r})}")
        return cls(risk=RiskConfig(**risk_d), **d)

    @classmethod
    def from_file(cls, path: str) -> "BotConfig":
        with open(path, encoding="utf-8") as fh:
            return cls.from_dict(json.load(fh))

    def to_dict(self) -> dict:
        return asdict(self)


def _hhmm(s: str):
    try:
        h, m = s.split(":")
        h, m = int(h), int(m)
        if not (0 <= h < 24 and 0 <= m < 60):
            raise ValueError
        return h * 60 + m
    except Exception:
        return None


def validate(cfg: BotConfig):
    """Return (errors, warnings). Errors block any order; warnings need human review."""
    e, w = [], []
    r = cfg.risk
    if cfg.mode not in MODES:
        e.append(f"mode must be one of {MODES}")
    if r.capital is None:
        e.append("risk.capital is REQUIRED INPUT (not assumed)")
    elif r.capital <= 0:
        e.append("risk.capital must be > 0")
    if not (0 < r.risk_per_trade_pct <= 2.0):
        e.append("risk_per_trade_pct must be in (0, 2]")
    if not (0 < r.max_daily_loss_pct <= 5.0):
        e.append("max_daily_loss_pct must be in (0, 5]")
    if r.max_weekly_loss_pct < r.max_daily_loss_pct:
        e.append("max_weekly_loss_pct must be >= max_daily_loss_pct")
    if r.max_daily_loss_pct < r.risk_per_trade_pct:
        e.append("max_daily_loss_pct must be >= risk_per_trade_pct")
    if r.max_open_positions < 1:
        e.append("max_open_positions must be >= 1")
    if r.min_risk_reward < 1.0:
        e.append("min_risk_reward must be >= 1")
    if r.max_consecutive_losses < 1:
        e.append("max_consecutive_losses must be >= 1")
    if r.max_leverage < 1.0 or r.max_leverage > 5.0:
        e.append("max_leverage must be in [1, 5]")
    for name in ("max_position_pct", "max_total_allocation_pct", "max_sector_exposure_pct"):
        v = getattr(r, name)
        if not (0 < v <= 100 * max(r.max_leverage, 1)):
            e.append(f"{name} out of range")
    if r.max_open_positions * r.risk_per_trade_pct > r.max_daily_loss_pct:
        w.append("all open positions stopping out at once would exceed the daily loss limit")
    ts, le, so = _hhmm(cfg.trading_start), _hhmm(cfg.last_entry), _hhmm(cfg.square_off)
    if None in (ts, le, so) or not (ts < le < so):
        e.append("times must be HH:MM with trading_start < last_entry < square_off")
    if cfg.options_enabled and "FNO" not in cfg.allowed_segments:
        e.append("options_enabled requires FNO in allowed_segments")
    if cfg.options_enabled:
        w.append("options enabled: requires completed options backtests (policy)")
    return e, w


def live_gate(cfg: BotConfig):
    """All conditions that must hold before LIVE orders. Never flips automatically."""
    reasons = []
    errs, _ = validate(cfg)
    reasons += errs
    if cfg.mode != "LIVE":
        reasons.append("mode is not LIVE")
    if not cfg.live_confirmed:
        reasons.append("live_confirmed not set by the user")
    if cfg.paper_sessions_completed < cfg.required_paper_sessions:
        reasons.append(
            f"paper validation incomplete: {cfg.paper_sessions_completed}/{cfg.required_paper_sessions} sessions")
    if cfg.kill_switch:
        reasons.append("kill switch is active")
    return (len(reasons) == 0), reasons
