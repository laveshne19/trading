"""Live Groww broker implementation.

Wraps Groww's official trading SDK (``growwapi``) behind :class:`BrokerInterface`
so the rest of the system (scanner, scoring, strategies, risk, execution,
portfolio, dashboard) works with Groww exactly as it does with Zerodha.

Notes / limitations:

* Requires a Groww API subscription and the ``growwapi`` (+ ``pyotp``) packages.
  Both are optional imports, so paper mode and tests run without them.
* Groww's API covers **NSE/BSE equity and F&O**. It does **not** offer MCX
  commodity trading — :data:`Segment.COMMODITY` instruments raise an error.
* Groww identifies instruments by ``trading_symbol`` + ``exchange`` + ``segment``
  (not a numeric token like Kite), so we pass those through and use a stable
  pseudo-token only for internal dict keys.
* The SDK's method/argument names are targeted at the documented public API.
  If your installed ``growwapi`` version differs, the thin mapping here is the
  only place that needs adjusting.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

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
    from growwapi import GrowwAPI  # type: ignore

    _HAS_GROWW = True
except Exception:  # pragma: no cover
    GrowwAPI = None  # type: ignore
    _HAS_GROWW = False


# --- value mappings (use Groww's documented string constants) -------------- #
_EXCHANGE = {Exchange.NSE: "NSE", Exchange.BSE: "BSE", Exchange.NFO: "NSE"}
_PRODUCT = {ProductType.MIS: "MIS", ProductType.CNC: "CNC", ProductType.NRML: "NRML"}
_ORDER_TYPE = {
    OrderType.MARKET: "MARKET",
    OrderType.LIMIT: "LIMIT",
    OrderType.SL: "SL",
    OrderType.SLM: "SL_M",
}
_STATUS_MAP = {
    "EXECUTED": OrderStatus.COMPLETE,
    "COMPLETE": OrderStatus.COMPLETE,
    "FILLED": OrderStatus.COMPLETE,
    "NEW": OrderStatus.OPEN,
    "ACKED": OrderStatus.OPEN,
    "APPROVED": OrderStatus.OPEN,
    "OPEN": OrderStatus.OPEN,
    "TRIGGER_PENDING": OrderStatus.OPEN,
    "CANCELLED": OrderStatus.CANCELLED,
    "REJECTED": OrderStatus.REJECTED,
    "FAILED": OrderStatus.REJECTED,
}


def _segment(instrument: Instrument) -> str:
    if instrument.segment is Segment.COMMODITY:
        raise BrokerError("Groww API does not support MCX/commodity trading.")
    return "FNO" if instrument.is_derivative else "CASH"


class GrowwBroker(BrokerInterface):
    """Live broker backed by the Groww trading API."""

    name = "groww"

    def __init__(self) -> None:
        if not _HAS_GROWW:
            raise BrokerError(
                "growwapi is not installed. `pip install growwapi pyotp` or use BROKER=paper."
            )
        if not (settings.groww_access_token or settings.groww_api_key):
            raise BrokerError("GROWW_ACCESS_TOKEN or GROWW_API_KEY must be configured.")
        self._groww = None
        self._connected = False

    # --- lifecycle -------------------------------------------------------
    def _resolve_access_token(self) -> str:
        if settings.groww_access_token:
            return settings.groww_access_token
        # Optionally mint a daily token from API key + secret (+ TOTP).
        try:  # pragma: no cover - network/credentials
            if settings.groww_totp_secret:
                import pyotp

                totp = pyotp.TOTP(settings.groww_totp_secret).now()
                return GrowwAPI.get_access_token(  # type: ignore[attr-defined]
                    api_key=settings.groww_api_key, totp=totp
                )
            return GrowwAPI.get_access_token(  # type: ignore[attr-defined]
                api_key=settings.groww_api_key, secret=settings.groww_api_secret
            )
        except Exception as exc:
            raise BrokerError(
                f"Could not obtain Groww access token: {exc}. "
                "Run scripts/groww_login.py and set GROWW_ACCESS_TOKEN."
            ) from exc

    def connect(self) -> None:
        token = self._resolve_access_token()
        try:  # pragma: no cover - network
            self._groww = GrowwAPI(token)
        except Exception as exc:
            raise BrokerError(f"Groww authentication failed: {exc}") from exc
        self._connected = True
        logger.info("GrowwBroker connected")

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
        try:  # pragma: no cover - network
            fn = getattr(self._groww, "get_available_margin_details", None) or getattr(
                self._groww, "get_margin_for_user", None
            )
            data = fn() if fn else {}
            for key in ("available_margin", "net_margin_available", "clear_cash", "available_cash"):
                if key in data:
                    return float(data[key])
            # nested shapes
            if "equity_margin_details" in data:
                return float(data["equity_margin_details"].get("net_margin_available", 0.0))
            return 0.0
        except Exception as exc:  # pragma: no cover
            raise BrokerError(f"get_available_margin failed: {exc}") from exc

    def get_positions(self) -> list[Position]:
        try:  # pragma: no cover - network
            fn = getattr(self._groww, "get_positions_for_user", None) or getattr(
                self._groww, "get_positions", None
            )
            raw = fn() if fn else {}
        except Exception as exc:  # pragma: no cover
            raise BrokerError(f"get_positions failed: {exc}") from exc
        rows = raw.get("positions", raw) if isinstance(raw, dict) else raw
        positions: list[Position] = []
        for p in rows or []:
            qty = int(p.get("quantity", p.get("net_quantity", 0)) or 0)
            if qty == 0:
                continue
            side = Side.BUY if qty > 0 else Side.SELL
            symbol = p.get("trading_symbol", p.get("symbol", ""))
            inst = Instrument(
                instrument_token=abs(hash(symbol)) % 90_000_000 + 1_000_000,
                tradingsymbol=symbol,
                name=symbol,
                exchange=Exchange(p.get("exchange", "NSE")),
                segment=Segment.OPTIONS if p.get("segment") == "FNO" else Segment.EQUITY,
            )
            positions.append(
                Position(
                    instrument=inst, side=side, quantity=abs(qty),
                    entry_price=float(p.get("average_price", 0.0)),
                    stop_loss=0.0, target=0.0,
                    product=ProductType(p.get("product", "MIS")),
                    strategy="external", trading_type=TradingType.INTRADAY,
                    last_price=float(p.get("last_price", 0.0)),
                )
            )
        return positions

    # --- market data -----------------------------------------------------
    def get_quote(self, instrument: Instrument) -> Quote:
        try:  # pragma: no cover - network
            data = self._groww.get_quote(
                exchange=_EXCHANGE[instrument.exchange],
                segment=_segment(instrument),
                trading_symbol=instrument.tradingsymbol,
            )
        except Exception as exc:  # pragma: no cover
            raise BrokerError(f"get_quote failed for {instrument.tradingsymbol}: {exc}") from exc
        ohlc = data.get("ohlc", {}) or {}
        depth = data.get("depth", {}) or {}
        bids = depth.get("buy") or [{}]
        asks = depth.get("sell") or [{}]
        return Quote(
            instrument_token=instrument.instrument_token,
            last_price=float(data.get("last_price", data.get("ltp", 0.0))),
            timestamp=datetime.utcnow(),
            volume=float(data.get("volume", 0.0)),
            oi=float(data.get("open_interest", 0.0) or 0.0),
            bid=float(bids[0].get("price", 0.0)),
            ask=float(asks[0].get("price", 0.0)),
            ohlc_open=float(ohlc.get("open", 0.0)),
            ohlc_high=float(ohlc.get("high", 0.0)),
            ohlc_low=float(ohlc.get("low", 0.0)),
            ohlc_close=float(ohlc.get("close", 0.0)),
        )

    def get_historical(
        self, instrument: Instrument, interval: str, days: int
    ) -> list[Candle]:
        end = datetime.now()
        start = end - timedelta(days=days)
        interval_minutes = {"minute": 1, "3minute": 3, "5minute": 5, "10minute": 10,
                            "15minute": 15, "30minute": 30, "60minute": 60,
                            "day": 1440}.get(interval, 1)
        try:  # pragma: no cover - network
            data = self._groww.get_historical_candle_data(
                trading_symbol=instrument.tradingsymbol,
                exchange=_EXCHANGE[instrument.exchange],
                segment=_segment(instrument),
                start_time=start.strftime("%Y-%m-%d %H:%M:%S"),
                end_time=end.strftime("%Y-%m-%d %H:%M:%S"),
                interval_in_minutes=interval_minutes,
            )
        except Exception as exc:  # pragma: no cover
            raise BrokerError(f"get_historical failed: {exc}") from exc
        candles_raw = data.get("candles", data) if isinstance(data, dict) else data
        candles: list[Candle] = []
        for row in candles_raw or []:
            # Groww returns [epoch, open, high, low, close, volume]
            ts = row[0]
            ts_dt = datetime.fromtimestamp(ts) if isinstance(ts, (int, float)) else datetime.fromisoformat(str(ts))
            candles.append(Candle(ts_dt, float(row[1]), float(row[2]), float(row[3]),
                                  float(row[4]), float(row[5] if len(row) > 5 else 0.0)))
        return candles

    # --- orders ----------------------------------------------------------
    def place_order(self, request: OrderRequest) -> OrderResult:
        if settings.dry_run:
            logger.warning("DRY_RUN active — not sending real Groww order for %s",
                           request.instrument.tradingsymbol)
            return OrderResult("DRYRUN", OrderStatus.COMPLETE,
                               filled_quantity=request.quantity,
                               average_price=request.price, message="dry-run")
        params = {
            "trading_symbol": request.instrument.tradingsymbol,
            "quantity": request.quantity,
            "validity": "DAY",
            "exchange": _EXCHANGE[request.instrument.exchange],
            "segment": _segment(request.instrument),
            "product": _PRODUCT[request.product],
            "order_type": _ORDER_TYPE[request.order_type],
            "transaction_type": "BUY" if request.side is Side.BUY else "SELL",
        }
        if request.order_type in (OrderType.LIMIT, OrderType.SL):
            params["price"] = request.price
        if request.order_type in (OrderType.SL, OrderType.SLM):
            params["trigger_price"] = request.trigger_price
        try:  # pragma: no cover - network
            resp = self._groww.place_order(**params)
        except Exception as exc:  # pragma: no cover
            raise BrokerError(f"place_order failed: {exc}") from exc
        order_id = str(resp.get("groww_order_id", resp.get("order_id", "")))
        status = _STATUS_MAP.get(str(resp.get("order_status", "")).upper(), OrderStatus.PENDING)
        audit(f"GROWW ORDER {request.side.value} {request.quantity} "
              f"{request.instrument.tradingsymbol} -> {order_id} ({status.value})")
        return OrderResult(order_id, status,
                           filled_quantity=int(resp.get("filled_quantity", 0)),
                           average_price=float(resp.get("average_price", 0.0)),
                           raw=resp)

    def modify_order(
        self, order_id: str, price: float | None = None, trigger_price: float | None = None
    ) -> OrderResult:
        try:  # pragma: no cover - network
            self._groww.modify_order(groww_order_id=order_id, price=price,
                                     trigger_price=trigger_price)
        except Exception as exc:  # pragma: no cover
            raise BrokerError(f"modify_order failed: {exc}") from exc
        return self.get_order_status(order_id)

    def cancel_order(self, order_id: str) -> OrderResult:
        try:  # pragma: no cover - network
            self._groww.cancel_order(groww_order_id=order_id)
        except Exception as exc:  # pragma: no cover
            raise BrokerError(f"cancel_order failed: {exc}") from exc
        return OrderResult(order_id, OrderStatus.CANCELLED)

    def get_order_status(self, order_id: str) -> OrderResult:
        try:  # pragma: no cover - network
            fn = getattr(self._groww, "get_order_status", None) or getattr(
                self._groww, "get_order_detail", None
            )
            data = fn(groww_order_id=order_id) if fn else {}
        except Exception as exc:  # pragma: no cover
            raise BrokerError(f"get_order_status failed: {exc}") from exc
        status = _STATUS_MAP.get(str(data.get("order_status", "")).upper(), OrderStatus.PENDING)
        return OrderResult(
            order_id=order_id,
            status=status,
            filled_quantity=int(data.get("filled_quantity", 0)),
            average_price=float(data.get("average_price", 0.0)),
            message=str(data.get("remark", "")),
            raw=data,
        )

    def place_gtt(
        self, instrument: Instrument, trigger_price: float, request: OrderRequest
    ) -> str:
        # Groww's API does not expose GTT the way Kite does; emulate with an
        # SL/SL-M resting order instead.
        logger.info("Groww has no GTT; placing an SL-M resting order instead.")
        sl_request = OrderRequest(
            instrument=instrument, side=request.side, quantity=request.quantity,
            order_type=OrderType.SLM, product=request.product,
            trigger_price=trigger_price, tag=request.tag,
        )
        return self.place_order(sl_request).order_id
