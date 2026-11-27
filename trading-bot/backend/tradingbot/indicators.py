"""Indicators on plain Python lists. Causal: value[i] uses data up to and including bar i only."""
from __future__ import annotations


def ema(values, n):
    out = [None] * len(values)
    if len(values) < n or n < 1:
        return out
    seed = sum(values[:n]) / n
    out[n - 1] = seed
    k = 2 / (n + 1)
    for i in range(n, len(values)):
        out[i] = values[i] * k + out[i - 1] * (1 - k)
    return out


def rsi(closes, n=14):
    out = [None] * len(closes)
    if len(closes) <= n:
        return out
    gains = [max(closes[i] - closes[i - 1], 0) for i in range(1, len(closes))]
    losses = [max(closes[i - 1] - closes[i], 0) for i in range(1, len(closes))]
    ag, al = sum(gains[:n]) / n, sum(losses[:n]) / n
    def val(ag, al):
        return 100.0 if al == 0 else 100 - 100 / (1 + ag / al)
    out[n] = val(ag, al)
    for i in range(n, len(gains)):
        ag = (ag * (n - 1) + gains[i]) / n
        al = (al * (n - 1) + losses[i]) / n
        out[i + 1] = val(ag, al)
    return out


def atr(highs, lows, closes, n=14):
    out = [None] * len(closes)
    if len(closes) <= n:
        return out
    tr = [highs[0] - lows[0]] + [max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
                                 for i in range(1, len(closes))]
    a = sum(tr[1:n + 1]) / n
    out[n] = a
    for i in range(n + 1, len(closes)):
        a = (a * (n - 1) + tr[i]) / n
        out[i] = a
    return out


def vwap(highs, lows, closes, volumes):
    """Session VWAP (caller passes one session's bars)."""
    out, pv, vv = [], 0.0, 0.0
    for h, l, c, v in zip(highs, lows, closes, volumes):
        pv += (h + l + c) / 3 * v
        vv += v
        out.append(pv / vv if vv else None)
    return out
