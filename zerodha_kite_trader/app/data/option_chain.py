"""Option-chain resolution: turn a directional view into a real option contract.

Given a directional option *intent* (BUY a CE for bullish, PE for bearish on an
underlying), this resolves the actual tradable contract — nearest expiry, ATM
(or offset) strike — from the broker's option list, and builds a concrete
:class:`Signal` on that option's premium.

**Fail-safe by design:** if no real contract can be resolved (broker can't
enumerate the chain, no expiry, no strike), it returns ``None`` and the engine
skips the trade. It never falls back to trading the underlying.
"""
from __future__ import annotations

from datetime import datetime

from app.broker.base import BrokerInterface
from app.config import settings
from app.domain import (
    Instrument,
    ProductType,
    Side,
    Signal,
    TradingType,
)
from app.logging_config import get_logger

logger = get_logger(__name__)

# Strike step per underlying (points between consecutive strikes).
STRIKE_STEPS: dict[str, float] = {
    "NIFTY": 50.0,
    "BANKNIFTY": 100.0,
    "FINNIFTY": 50.0,
    "MIDCPNIFTY": 25.0,
    "SENSEX": 100.0,
}
_DEFAULT_STEP = 50.0


def atm_strike(spot: float, step: float) -> float:
    """Nearest strike to spot on the given step grid."""
    if step <= 0:
        return round(spot)
    return round(spot / step) * step


class OptionChainResolver:
    """Resolves ATM option contracts and builds option signals."""

    def __init__(self, broker: BrokerInterface) -> None:
        self._broker = broker

    def _nearest_expiry_strike(
        self, options: list[Instrument], target_strike: float, option_type: str
    ) -> Instrument | None:
        candidates = [
            o for o in options
            if o.instrument_type == option_type and o.strike is not None and o.expiry is not None
        ]
        if not candidates:
            # Some chains omit expiry; fall back to strike-only matching.
            candidates = [
                o for o in options if o.instrument_type == option_type and o.strike is not None
            ]
        if not candidates:
            return None
        now = datetime.now()
        future = [o for o in candidates if o.expiry is None or o.expiry >= now] or candidates
        # nearest expiry, then nearest strike to ATM
        future.sort(
            key=lambda o: (
                (o.expiry - now).days if o.expiry else 0,
                abs((o.strike or 0.0) - target_strike),
            )
        )
        return future[0]

    def resolve(self, intent: Signal) -> Signal | None:
        """Resolve ``intent`` (an option intent on an underlying) to a real
        option-contract Signal, or None to skip."""
        option_type = intent.meta.get("option_type")
        underlying = intent.meta.get("underlying")
        if option_type not in ("CE", "PE") or not underlying:
            return None

        try:
            options = self._broker.list_options(underlying)
        except Exception as exc:
            logger.warning("list_options(%s) failed: %s", underlying, exc)
            return None
        if not options:
            logger.info("No option chain available for %s; skipping (fail-safe).", underlying)
            return None

        step = STRIKE_STEPS.get(underlying.upper(), _DEFAULT_STEP)
        spot = intent.entry_price  # underlying spot from the intent
        target = atm_strike(spot, step)
        contract = self._nearest_expiry_strike(options, target, option_type)
        if contract is None:
            logger.info("Could not resolve %s %s ~%.0f; skipping.", underlying, option_type, target)
            return None

        # Entry = current option premium (LTP). Fail safe if unavailable.
        try:
            premium = float(self._broker.get_quote(contract).last_price)
        except Exception as exc:
            logger.warning("option quote failed for %s: %s", contract.tradingsymbol, exc)
            return None
        if premium <= 0:
            return None

        sl = round(premium * (1 - settings.option_sl_pct / 100.0), 2)
        tgt = round(premium * (1 + settings.option_target_pct / 100.0), 2)

        sig = Signal(
            instrument=contract,
            strategy=intent.strategy,
            side=Side.BUY,                      # buying options (long CE/PE)
            entry_price=premium,
            stop_loss=sl,
            target=tgt,
            product=ProductType.NRML,
            trading_type=TradingType.INTRADAY,
            opportunity_score=intent.opportunity_score,
            rationale=f"{intent.rationale} -> {contract.tradingsymbol} @ {premium}",
            meta={
                **intent.meta,
                "resolved_option": contract.tradingsymbol,
                "strike": contract.strike,
                "expiry": str(contract.expiry) if contract.expiry else "",
                "premium": premium,
            },
        )
        return sig
