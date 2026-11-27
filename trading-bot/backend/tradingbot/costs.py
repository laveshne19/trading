"""Indian transaction-cost model. RATES MUST BE VERIFIED against your contract notes.

STT options/futures values reflect the Union Budget 2026-27 summary (effective 1 Apr 2026):
futures sell 0.05%, options premium sell 0.15%. Other rates are best-known values, flagged VERIFY.
"""
from __future__ import annotations

RATES = {
    "equity_intraday": {  # VERIFY all against contract note
        "brokerage_pct": 0.1, "brokerage_cap": 20.0,
        "stt_sell_pct": 0.025, "exch_txn_pct": 0.00297, "sebi_pct": 0.0001,
        "stamp_buy_pct": 0.003, "gst_pct": 18.0,
    },
    "options": {  # VERIFY all against contract note
        "brokerage_flat": 20.0, "stt_sell_pct": 0.15, "exch_txn_pct": 0.03503,
        "sebi_pct": 0.0001, "stamp_buy_pct": 0.003, "gst_pct": 18.0,
    },
}


def equity_intraday_costs(buy_value: float, sell_value: float, rates: dict | None = None) -> dict:
    r = (rates or RATES)["equity_intraday"]
    brk = sum(min(v * r["brokerage_pct"] / 100, r["brokerage_cap"]) for v in (buy_value, sell_value) if v > 0)
    stt = sell_value * r["stt_sell_pct"] / 100
    exch = (buy_value + sell_value) * r["exch_txn_pct"] / 100
    sebi = (buy_value + sell_value) * r["sebi_pct"] / 100
    stamp = buy_value * r["stamp_buy_pct"] / 100
    gst = (brk + exch + sebi) * r["gst_pct"] / 100
    total = brk + stt + exch + sebi + stamp + gst
    return {k: round(v, 4) for k, v in dict(brokerage=brk, stt=stt, exchange=exch, sebi=sebi,
                                              stamp=stamp, gst=gst, total=total).items()}


def options_costs(buy_premium_value: float, sell_premium_value: float, rates: dict | None = None) -> dict:
    r = (rates or RATES)["options"]
    brk = r["brokerage_flat"] * sum(1 for v in (buy_premium_value, sell_premium_value) if v > 0)
    stt = sell_premium_value * r["stt_sell_pct"] / 100
    exch = (buy_premium_value + sell_premium_value) * r["exch_txn_pct"] / 100
    sebi = (buy_premium_value + sell_premium_value) * r["sebi_pct"] / 100
    stamp = buy_premium_value * r["stamp_buy_pct"] / 100
    gst = (brk + exch + sebi) * r["gst_pct"] / 100
    total = brk + stt + exch + sebi + stamp + gst
    return {k: round(v, 4) for k, v in dict(brokerage=brk, stt=stt, exchange=exch, sebi=sebi,
                                              stamp=stamp, gst=gst, total=total).items()}
