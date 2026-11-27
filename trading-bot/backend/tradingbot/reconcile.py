"""Compare what the ledger says we hold with what the broker says. Any difference on a bot symbol locks the bot."""
from __future__ import annotations
from .broker import Broker
from .config import BotConfig
from .ledger import Ledger
from .risk import RiskEngine


def reconcile(cfg: BotConfig, ledger: Ledger, broker: Broker, risk: RiskEngine) -> dict:
    expected = ledger.net_positions()
    actual = broker.get_positions()
    known = ledger.ever_traded()
    mismatches, foreign = {}, {}
    for sym in set(expected) | set(actual):
        e, a = expected.get(sym, 0), actual.get(sym, 0)
        if e == a:
            continue
        if sym in known:
            mismatches[sym] = {"ledger": e, "broker": a}
        else:
            foreign[sym] = a        # positions the bot never touched (e.g. your manual trades)
    if mismatches:
        ledger.event("reconcile_mismatch", mismatches=mismatches)
        risk.lock("RECON", f"position mismatch: {mismatches}")
    if foreign:
        ledger.event("foreign_positions", positions=foreign)
        if cfg.strict_account_scope:
            risk.lock("RECON", f"foreign positions in account: {sorted(foreign)}")
    return {"ok": not mismatches and not (foreign and cfg.strict_account_scope),
            "mismatches": mismatches, "foreign": foreign}
