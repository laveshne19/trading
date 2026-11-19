"""Thin typed wrapper around the ``growwapi`` SDK.

Everything that leaves this module is a dataclass from
``trading_system.broker.models`` (plus a raw dict for diagnostics).
This keeps strategy / persistence code insulated from the SDK's dict
responses.

Only reads are implemented in Stage 1. ``place_order`` et al are
implemented but are disabled unless ``paper_trading`` is False — see
``AppConfig.paper_trading``. The live trading loop in Stage 3 is what
will actually call them.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Iterable, Sequence

from trading_system.broker.auth import AccessToken, fetch_access_token
from trading_system.broker.exceptions import (
    BrokerAuthError,
    BrokerError,
    OrderRejectedError,
)
from trading_system.broker.models import (
    Candle,
    CandleInterval,
    MarginDetails,
    OrderRequest,
    OrderStatus,
    PlacedOrder,
    Quote,
    UserProfile,
)
from trading_system.config import GrowwConfig

log = logging.getLogger(__name__)


class GrowwClient:
    """Typed facade over ``growwapi.GrowwAPI``.

    Create with ``GrowwClient.from_env()`` or ``GrowwClient.from_config``
    for production use. In tests, construct with a pre-built ``raw``
    GrowwAPI stub via ``GrowwClient(raw=stub)``.
    """

    def __init__(self, *, raw: Any, access_token: AccessToken | None = None) -> None:
        self._raw = raw
        self._access_token = access_token

    # --------------------------------------------------------------- init

    @classmethod
    def from_config(cls, cfg: GrowwConfig) -> "GrowwClient":
        try:
            from growwapi import GrowwAPI
        except ImportError as exc:  # pragma: no cover
            raise BrokerAuthError(
                "growwapi is not installed. Run `pip install growwapi`."
            ) from exc
        token = fetch_access_token(cfg)
        return cls(raw=GrowwAPI(token.token), access_token=token)

    @classmethod
    def from_env(cls) -> "GrowwClient":
        return cls.from_config(GrowwConfig.from_env())

    @property
    def sdk(self) -> Any:
        """Escape hatch to the underlying SDK. Prefer typed methods."""
        return self._raw

    # ---------------------------------------------------------- read ops

    def get_profile(self) -> UserProfile:
        payload = self._call("get_user_profile")
        return UserProfile(
            user_id=str(payload.get("user_id") or payload.get("id") or ""),
            name=payload.get("name"),
            email=payload.get("email"),
            raw=payload,
        )

    def get_margin(self) -> MarginDetails:
        payload = self._call("get_available_margin_details")
        return MarginDetails(
            available_margin=float(payload.get("available_margin", 0) or 0),
            used_margin=float(payload.get("used_margin", 0) or 0),
            raw=payload,
        )

    def get_ltp(
        self, symbols: Sequence[str], *, segment: str
    ) -> dict[str, float]:
        """Return a ``{trading_symbol: ltp}`` map for the given symbols.

        ``symbols`` are passed to the SDK as a tuple of
        ``"<EXCHANGE>_<TRADING_SYMBOL>"`` entries, per Groww's docs.
        """
        payload = self._call(
            "get_ltp",
            exchange_trading_symbols=tuple(symbols),
            segment=segment,
        )
        out: dict[str, float] = {}
        for key, value in (payload or {}).items():
            try:
                out[str(key)] = float(value)
            except (TypeError, ValueError):
                continue
        return out

    def get_quote(
        self, *, trading_symbol: str, exchange: str, segment: str
    ) -> Quote:
        payload = self._call(
            "get_quote",
            trading_symbol=trading_symbol,
            exchange=exchange,
            segment=segment,
        )
        return Quote(
            trading_symbol=trading_symbol,
            exchange=exchange,
            ltp=float(payload.get("last_price") or payload.get("ltp") or 0.0),
            bid=_opt_float(payload.get("bid_price")),
            ask=_opt_float(payload.get("ask_price")),
            volume=_opt_int(payload.get("volume")),
            raw=payload,
        )

    def get_historical_candles(
        self,
        *,
        exchange: str,
        segment: str,
        groww_symbol: str,
        start: datetime,
        end: datetime,
        interval: CandleInterval,
    ) -> list[Candle]:
        """Fetch OHLCV bars between ``start`` and ``end`` (inclusive).

        Groww returns bar lists as ``[epoch_ms, o, h, l, c, v]``. We
        keep volume as ``None`` when it comes back zero or missing
        (index bars have no volume).
        """
        payload = self._call(
            "get_historical_candles",
            exchange=exchange,
            segment=segment,
            groww_symbol=groww_symbol,
            start_time=_fmt_dt(start),
            end_time=_fmt_dt(end),
            candle_interval=interval.value,
        )
        rows = payload.get("candles") if isinstance(payload, dict) else payload
        if not rows:
            return []
        candles: list[Candle] = []
        for row in rows:
            if len(row) < 5:
                continue
            ts_raw, o, h, l, c, *rest = row
            volume = rest[0] if rest else None
            candles.append(
                Candle(
                    ts=_parse_ts(ts_raw),
                    open=float(o),
                    high=float(h),
                    low=float(l),
                    close=float(c),
                    volume=_opt_int(volume),
                )
            )
        return candles

    def get_expiries(
        self, *, exchange: str, underlying: str
    ) -> list[str]:
        payload = self._call(
            "get_expiries",
            exchange=exchange,
            underlying_symbol=underlying,
        )
        if isinstance(payload, dict):
            return [str(e) for e in payload.get("expiries", [])]
        if isinstance(payload, Iterable):
            return [str(e) for e in payload]
        return []

    def get_option_chain(
        self, *, exchange: str, underlying: str, expiry: str
    ) -> dict:
        return self._call(
            "get_option_chain",
            exchange=exchange,
            underlying=underlying,
            expiry_date=expiry,
        )

    # --------------------------------------------------------- write ops

    def place_order(self, req: OrderRequest) -> PlacedOrder:
        """Send an order to the broker.

        No paper-trading check lives here: that decision belongs to the
        strategy layer so we don't silently swallow intended-live orders.
        """
        try:
            payload = self._call(
                "place_order",
                validity=req.validity,
                exchange=req.exchange,
                order_type=req.order_type,
                product=req.product,
                quantity=req.quantity,
                segment=req.segment,
                trading_symbol=req.trading_symbol,
                transaction_type=req.side.value,
                order_reference_id=req.reference_id,
                price=req.price if req.price is not None else 0.0,
                trigger_price=req.trigger_price,
            )
        except BrokerError:
            raise
        except Exception as exc:
            raise OrderRejectedError(str(exc)) from exc

        oid = payload.get("groww_order_id") or payload.get("order_id") or ""
        if not oid:
            raise OrderRejectedError(
                "Broker returned no order id", broker_payload=payload
            )
        return PlacedOrder(
            broker_order_id=str(oid),
            reference_id=req.reference_id,
            status=OrderStatus.from_raw(payload.get("order_status")),
            raw=payload,
        )

    def get_order_status(
        self, *, broker_order_id: str, segment: str
    ) -> OrderStatus:
        payload = self._call(
            "get_order_status",
            segment=segment,
            groww_order_id=broker_order_id,
        )
        return OrderStatus.from_raw(payload.get("order_status"))

    def cancel_order(self, *, broker_order_id: str, segment: str) -> dict:
        return self._call(
            "cancel_order",
            groww_order_id=broker_order_id,
            segment=segment,
        )

    # ----------------------------------------------------------- helpers

    def _call(self, method: str, **kwargs: Any) -> dict:
        fn = getattr(self._raw, method, None)
        if fn is None:
            raise BrokerError(
                f"GrowwAPI has no method {method!r}. "
                "Is the installed growwapi version compatible?"
            )
        try:
            result = fn(**{k: v for k, v in kwargs.items() if v is not None})
        except BrokerError:
            raise
        except Exception as exc:
            log.exception("Groww %s call failed", method)
            raise BrokerError(f"{method} failed: {exc}") from exc
        if result is None:
            return {}
        if isinstance(result, dict):
            return result
        # Some SDK calls return lists / DataFrames; wrap them so callers
        # always see a dict.
        return {"result": result}


# ------------------------------------------------------------- utilities


def _fmt_dt(dt: datetime) -> str:
    # Groww accepts ISO8601 without offset. We emit UTC-naive ISO; it
    # is the caller's job to pass IST-localized datetimes.
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def _parse_ts(raw: Any) -> datetime:
    if isinstance(raw, (int, float)):
        # Groww sends epoch seconds in some endpoints, ms in others.
        # Heuristic: anything past 10^12 is ms.
        ts = float(raw)
        if ts > 1e12:
            ts /= 1000.0
        return datetime.fromtimestamp(ts)
    if isinstance(raw, str):
        try:
            return datetime.fromisoformat(raw)
        except ValueError:
            pass
    raise BrokerError(f"Unrecognized candle timestamp format: {raw!r}")


def _opt_float(x: Any) -> float | None:
    if x is None:
        return None
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def _opt_int(x: Any) -> int | None:
    if x is None:
        return None
    try:
        return int(x)
    except (TypeError, ValueError):
        return None
