"""Live Zerodha Kite Connect broker implementation.

Wraps the official ``kiteconnect`` SDK behind :class:`BrokerInterface`, mapping
our domain types to/from Kite's dict-based API and translating errors into
:class:`BrokerError`. Network calls are retried with exponential backoff.

The ``kiteconnect`` package is an optional import so the rest of the system
(paper mode, tests, backtests) runs without it installed.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.broker.base import BrokerError, BrokerInterface
from app.config import settings
from app.domain import (
    Candle,
    Exchange,
    Instrument,
    OrderRequest,
    OrderResult,
    OrderStatus,
    OrderType,
    Position,
    ProductType,
    Quote,
    Segment,
    Side,
    TradingType,
)
from app.logging_config import audit, get_logger

logger = get_logger(__name__)

try:  # pragma: no cover - optional dependency
    from kiteconnect import KiteConnect  # type: ignore

    _HAS_KITE = True
except Exception:  # pragma: no cover
    KiteConnect = None  # type: ignore
    _HAS_KITE = False


# Map our enums to Kite's string constants.
_STATUS_MAP = {
    "COMPLETE": OrderStatus.COMPLETE,
    "REJECTED": OrderStatus.REJECTED,
    "CANCELLED": OrderStatus.CANCELLED,
    "OPEN": OrderStatus.OPEN,
    "TRIGGER PENDING": OrderStatus.OPEN,
    "PUT ORDER REQ RECEIVED": OrderStatus.PENDING,
    "VALIDATION PENDING": OrderStatus.PENDING,
}


class KiteBroker(BrokerInterface):
    """Live broker backed by Kite Connect."""

    name = "kite"

    def __init__(self) -> None:
        if not _HAS_KITE:
            raise BrokerError(
                "kiteconnect is not installed. `pip install kiteconnect` or use BROKER=paper."
            )
        if not settings.kite_api_key:
            raise BrokerError("KITE_API_KEY is not configured.")
        self._kite = KiteConnect(api_key=settings.kite_api_key)
        self._connected = False

    # --- lifecycle -------------------------------------------------------
    def connect(self) -> None:
        if not settings.kite_access_token:
            raise BrokerError(
                "KITE_ACCESS_TOKEN missing. Run scripts/kite_login.py to generate today's token."
            )
        self._kite.set_access_token(settings.kite_access_token)
        try:
            profile = self._kite.profile()
        except Exception as exc:  # pragma: no cover - network
            raise BrokerError(f"Kite authentication failed: {exc}") from exc
        self._connected = True
        logger.info("KiteBroker connected as %s", profile.get("user_id"))

    def is_connected(self) -> bool:
        return self._connected

    # --- account ---------------------------------------------------------
    @retry(
        retry=retry_if_exception_type(BrokerError),
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=2, min=2, max=16),
        reraise=True,
    )
    def get_available_margin(self) -> float:
        try:
            margins = self._kite.margins(segment="equity")
            return float(margins["available"]["live_balance"])
        except Exception as exc:  # pragma: no cover - network
            raise BrokerError(f"margins() failed: {exc}") from exc

    def get_positions(self) -> list[Position]:
        try:
            raw = self._kite.positions()
        except Exception as exc:  # pragma: no cover - network
            raise BrokerError(f"positions() failed: {exc}") from exc
        positions: list[Position] = []
        for p in raw.get("net", []):
            qty = int(p["quantity"])
            if qty == 0:
                continue
            side = Side.BUY if qty > 0 else Side.SELL
            inst = Instrument(
                instrument_token=int(p.get("instrument_token", 0)),
                tradingsymbol=p["tradingsymbol"],
                name=p["tradingsymbol"],
                exchange=Exchange(p["exchange"]),
                segment=self._segment_for(p["exchange"]),
                lot_size=1,
            )
            positions.append(
                Position(
                    instrument=inst,
                    side=side,
                    quantity=abs(qty),
                    entry_price=float(p["average_price"]),
                    stop_loss=0.0,
                    target=0.0,
                    product=ProductType(p["product"]),
                    strategy="external",
                    trading_type=TradingType.INTRADAY,
                    last_price=float(p["last_price"]),
                )
            )
        return positions

    # --- market data -----------------------------------------------------
    def get_quote(self, instrument: Instrument) -> Quote:
        key = f"{instrument.exchange.value}:{instrument.tradingsymbol}"
        try:
            data = self._kite.quote([key])[key]
        except Exception as exc:  # pragma: no cover - network
            raise BrokerError(f"quote() failed for {key}: {exc}") from exc
        depth = data.get("depth", {})
        bid = depth.get("buy", [{}])[0].get("price", 0.0) if depth else 0.0
        ask = depth.get("sell", [{}])[0].get("price", 0.0) if depth else 0.0
        ohlc = data.get("ohlc", {})
        return Quote(
            instrument_token=instrument.instrument_token,
            last_price=float(data["last_price"]),
            timestamp=datetime.utcnow(),
            volume=float(data.get("volume", 0.0)),
            oi=float(data.get("oi", 0.0)),
            bid=float(bid),
            ask=float(ask),
            ohlc_open=float(ohlc.get("open", 0.0)),
            ohlc_high=float(ohlc.get("high", 0.0)),
            ohlc_low=float(ohlc.get("low", 0.0)),
            ohlc_close=float(ohlc.get("close", 0.0)),
        )

    def get_historical(
        self, instrument: Instrument, interval: str, days: int
    ) -> list[Candle]:
        to_date = datetime.now()
        from_date = to_date - timedelta(days=days)
        try:
            rows = self._kite.historical_data(
                instrument.instrument_token, from_date, to_date, interval,
                oi=instrument.is_derivative,
            )
        except Exception as exc:  # pragma: no cover - network
            raise BrokerError(f"historical_data() failed: {exc}") from exc
        return [
            Candle(
                timestamp=r["date"],
                open=float(r["open"]),
                high=float(r["high"]),
                low=float(r["low"]),
                close=float(r["close"]),
                volume=float(r["volume"]),
                oi=float(r["oi"]) if "oi" in r else None,
            )
            for r in rows
        ]

    # --- orders ----------------------------------------------------------
    def place_order(self, request: OrderRequest) -> OrderResult:
        if settings.dry_run:
            logger.warning("DRY_RUN active — not sending real order for %s",
                           request.instrument.tradingsymbol)
            return OrderResult("DRYRUN", OrderStatus.COMPLETE,
                               filled_quantity=request.quantity,
                               average_price=request.price, message="dry-run")
        params = {
            "variety": self._kite.VARIETY_REGULAR,
            "exchange": request.instrument.exchange.value,
            "tradingsymbol": request.instrument.tradingsymbol,
            "transaction_type": (
                self._kite.TRANSACTION_TYPE_BUY if request.side is Side.BUY
                else self._kite.TRANSACTION_TYPE_SELL
            ),
            "quantity": request.quantity,
            "product": request.product.value,
            "order_type": self._order_type(request.order_type),
            "tag": (request.tag or "auto")[:20],
        }
        if request.order_type in (OrderType.LIMIT, OrderType.SL):
            params["price"] = request.price
        if request.order_type in (OrderType.SL, OrderType.SLM):
            params["trigger_price"] = request.trigger_price
        try:
            order_id = self._kite.place_order(**params)
        except Exception as exc:  # pragma: no cover - network
            raise BrokerError(f"place_order failed: {exc}") from exc
        audit(f"KITE ORDER {request.side.value} {request.quantity} "
              f"{request.instrument.tradingsymbol} -> {order_id}")
        return self.get_order_status(order_id)

    def modify_order(
        self, order_id: str, price: float | None = None, trigger_price: float | None = None
    ) -> OrderResult:
        try:
            self._kite.modify_order(
                variety=self._kite.VARIETY_REGULAR,
                order_id=order_id,
                price=price,
                trigger_price=trigger_price,
            )
        except Exception as exc:  # pragma: no cover - network
            raise BrokerError(f"modify_order failed: {exc}") from exc
        return self.get_order_status(order_id)

    def cancel_order(self, order_id: str) -> OrderResult:
        try:
            self._kite.cancel_order(variety=self._kite.VARIETY_REGULAR, order_id=order_id)
        except Exception as exc:  # pragma: no cover - network
            raise BrokerError(f"cancel_order failed: {exc}") from exc
        return OrderResult(order_id, OrderStatus.CANCELLED)

    def get_order_status(self, order_id: str) -> OrderResult:
        try:
            history = self._kite.order_history(order_id)
        except Exception as exc:  # pragma: no cover - network
            raise BrokerError(f"order_history failed: {exc}") from exc
        if not history:
            return OrderResult(order_id, OrderStatus.PENDING)
        last = history[-1]
        status = _STATUS_MAP.get(last.get("status", ""), OrderStatus.PENDING)
        return OrderResult(
            order_id=order_id,
            status=status,
            filled_quantity=int(last.get("filled_quantity", 0)),
            average_price=float(last.get("average_price", 0.0)),
            message=last.get("status_message") or "",
            raw=last,
        )

    def place_gtt(
        self, instrument: Instrument, trigger_price: float, request: OrderRequest
    ) -> str:
        try:
            resp = self._kite.place_gtt(
                trigger_type=self._kite.GTT_TYPE_SINGLE,
                tradingsymbol=instrument.tradingsymbol,
                exchange=instrument.exchange.value,
                trigger_values=[trigger_price],
                last_price=request.price or trigger_price,
                orders=[{
                    "transaction_type": (
                        self._kite.TRANSACTION_TYPE_BUY if request.side is Side.BUY
                        else self._kite.TRANSACTION_TYPE_SELL
                    ),
                    "quantity": request.quantity,
                    "order_type": self._kite.ORDER_TYPE_LIMIT,
                    "product": request.product.value,
                    "price": request.price or trigger_price,
                }],
            )
        except Exception as exc:  # pragma: no cover - network
            raise BrokerError(f"place_gtt failed: {exc}") from exc
        return str(resp.get("trigger_id", ""))

    # --- helpers ---------------------------------------------------------
    def _order_type(self, ot: OrderType) -> str:
        return {
            OrderType.MARKET: self._kite.ORDER_TYPE_MARKET,
            OrderType.LIMIT: self._kite.ORDER_TYPE_LIMIT,
            OrderType.SL: self._kite.ORDER_TYPE_SL,
            OrderType.SLM: self._kite.ORDER_TYPE_SLM,
        }[ot]

    @staticmethod
    def _segment_for(exchange: str) -> Segment:
        return {
            "NSE": Segment.EQUITY,
            "BSE": Segment.EQUITY,
            "NFO": Segment.OPTIONS,
            "MCX": Segment.COMMODITY,
            "CDS": Segment.FUTURES,
        }.get(exchange, Segment.EQUITY)
