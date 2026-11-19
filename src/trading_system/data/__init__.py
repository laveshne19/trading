"""Historical + live market data plumbing — stub.

Populated in Stage 2 with:
* ``historical`` — bulk backfill of 1m NIFTY bars via Groww's REST
* ``resample`` — 1m → 5m / 15m / 30m, aligned to the 09:15 IST session open
* ``live`` — GrowwFeed-driven 1m aggregation + tick-to-bar builder
"""
