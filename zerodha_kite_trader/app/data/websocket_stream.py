"""Live tick streaming via Kite's WebSocket (KiteTicker).

Maintains a thread-safe latest-tick cache and dispatches ticks to registered
callbacks (e.g. the portfolio manager's trailing-stop logic). Optional: the
system also works in polling mode using REST quotes when streaming is off.
"""
from __future__ import annotations

import threading
from collections.abc import Callable

from app.config import settings
from app.logging_config import get_logger

logger = get_logger(__name__)

TickCallback = Callable[[dict[int, float]], None]


class TickStream:
    """Wrapper around KiteTicker with graceful degradation."""

    def __init__(self) -> None:
        self._latest: dict[int, float] = {}
        self._lock = threading.Lock()
        self._callbacks: list[TickCallback] = []
        self._tokens: set[int] = set()
        self._ticker = None
        self._running = False

    def register(self, callback: TickCallback) -> None:
        self._callbacks.append(callback)

    def subscribe(self, tokens: list[int]) -> None:
        with self._lock:
            self._tokens.update(tokens)
        if self._ticker is not None and self._running:
            try:
                self._ticker.subscribe(list(tokens))
                self._ticker.set_mode(self._ticker.MODE_FULL, list(tokens))
            except Exception as exc:  # pragma: no cover - network
                logger.warning("ws subscribe failed: %s", exc)

    def last_price(self, token: int) -> float | None:
        with self._lock:
            return self._latest.get(token)

    def snapshot(self) -> dict[int, float]:
        with self._lock:
            return dict(self._latest)

    def start(self) -> None:
        """Start the WebSocket connection (no-op without credentials)."""
        if not settings.kite_api_key or not settings.kite_access_token:
            logger.info("TickStream disabled (no Kite credentials); using REST polling.")
            return
        try:  # pragma: no cover - requires live creds
            from kiteconnect import KiteTicker  # type: ignore
        except Exception:
            logger.info("kiteconnect not installed; TickStream disabled.")
            return

        ticker = KiteTicker(settings.kite_api_key, settings.kite_access_token)

        def on_ticks(ws, ticks):  # noqa: ANN001
            updates: dict[int, float] = {}
            with self._lock:
                for t in ticks:
                    token = t["instrument_token"]
                    price = float(t["last_price"])
                    self._latest[token] = price
                    updates[token] = price
            for cb in self._callbacks:
                try:
                    cb(updates)
                except Exception:  # pragma: no cover
                    logger.exception("tick callback error")

        def on_connect(ws, response):  # noqa: ANN001
            logger.info("WebSocket connected; subscribing to %d tokens", len(self._tokens))
            if self._tokens:
                ws.subscribe(list(self._tokens))
                ws.set_mode(ws.MODE_FULL, list(self._tokens))

        def on_close(ws, code, reason):  # noqa: ANN001
            logger.warning("WebSocket closed: %s %s", code, reason)

        ticker.on_ticks = on_ticks
        ticker.on_connect = on_connect
        ticker.on_close = on_close
        self._ticker = ticker
        self._running = True
        ticker.connect(threaded=True)

    def stop(self) -> None:
        self._running = False
        if self._ticker is not None:
            try:  # pragma: no cover
                self._ticker.close()
            except Exception:
                pass
