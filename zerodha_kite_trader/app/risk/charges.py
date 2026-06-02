"""Approximate Indian trading-cost model (brokerage, STT, GST, etc.).

These costs are the difference between a strategy that *looks* profitable in a
naive backtest and one that actually is. The numbers below approximate
Zerodha's published charges as of 2024–25 and should be re-validated against
your contract notes. Used by the risk manager (net-edge checks) and the
backtester (realistic P&L).
"""
from __future__ import annotations

from app.domain import ProductType, Segment, Side

# Zerodha flat brokerage: ₹20 or 0.03% (whichever lower) per executed order
# for intraday & F&O; equity delivery (CNC) is ₹0 brokerage.
_BROKERAGE_FLAT = 20.0
_BROKERAGE_PCT = 0.0003


def _brokerage(turnover: float, product: ProductType) -> float:
    if product is ProductType.CNC:
        return 0.0
    return min(_BROKERAGE_FLAT, turnover * _BROKERAGE_PCT)


def estimate_charges(
    segment: Segment,
    product: ProductType,
    side: Side,
    price: float,
    quantity: int,
) -> float:
    """Estimate one-leg charges (₹) for an order.

    Round-trip cost ≈ entry charges + exit charges; call this for each leg.
    Components: brokerage, STT/CTT, exchange txn, SEBI, GST, stamp duty.
    """
    turnover = price * quantity
    if turnover <= 0:
        return 0.0

    brokerage = _brokerage(turnover, product)

    # STT / CTT — only on the relevant leg per segment.
    stt = 0.0
    if segment is Segment.EQUITY:
        if product is ProductType.CNC:
            stt = turnover * 0.001            # 0.1% both buy & sell
        elif side is Side.SELL:
            stt = turnover * 0.00025          # 0.025% sell only (intraday)
    elif segment is Segment.FUTURES:
        if side is Side.SELL:
            stt = turnover * 0.0002           # 0.02% sell side
    elif segment is Segment.OPTIONS:
        if side is Side.SELL:
            stt = turnover * 0.001            # 0.1% on premium, sell side
    elif segment is Segment.COMMODITY:
        if side is Side.SELL:
            stt = turnover * 0.0001           # CTT 0.01% sell side (non-agri)

    # Exchange transaction charges (approx, segment-dependent).
    exch_rate = {
        Segment.EQUITY: 0.0000297,
        Segment.FUTURES: 0.0000173,
        Segment.OPTIONS: 0.0003503,           # on premium
        Segment.COMMODITY: 0.0000260,
    }.get(segment, 0.0000297)
    exchange_txn = turnover * exch_rate

    sebi = turnover * 0.000001                # ₹10 per crore
    gst = (brokerage + exchange_txn + sebi) * 0.18

    # Stamp duty — buy side only.
    stamp = 0.0
    if side is Side.BUY:
        stamp_rate = {
            Segment.EQUITY: 0.00003 if product is not ProductType.CNC else 0.00015,
            Segment.FUTURES: 0.00002,
            Segment.OPTIONS: 0.00003,
            Segment.COMMODITY: 0.00002,
        }.get(segment, 0.00003)
        stamp = turnover * stamp_rate

    return round(brokerage + stt + exchange_txn + sebi + gst + stamp, 2)


def round_trip_charges(
    segment: Segment, product: ProductType, entry: float, exit_price: float, quantity: int
) -> float:
    """Total charges for a complete in-and-out trade."""
    buy = estimate_charges(segment, product, Side.BUY, entry, quantity)
    sell = estimate_charges(segment, product, Side.SELL, exit_price, quantity)
    return round(buy + sell, 2)
