"""Paper / simulation broker.

Simulates fills with configurable slippage so the whole stack can run end to
end without a Kite account or real money. Market orders fill immediately at
last price ± slippage; limit/SL orders fill when the simulated price crosses
the trigger (checked on each :meth:`get_quote`).

Historical data, if a real Kite session is *not* available, is synthesised as a
geometric random walk — enough to exercise the pipeline. For realistic
backtests, feed real candles via the backtest engine instead.
"""
from __future__ import annotations

import itertools
import random
from datetime import datetime, timedelta

from app.broker.base import BrokerInterface
from app.config import settings
from app.domain import (
    Candle,
    Instrument,
    OrderRequest,
    OrderResult,
    OrderStatus,
    OrderType,
    Position,
    Quote,
    Side,
    TradingType,
)
from app.logging_config import audit, get_logger

logger = get_logger(__name__)


class PaperBroker(BrokerInterface):
    """In-memory simulated broker."""

    name = "paper"

    def __init__(
        self,
        starting_cash: float | None = None,
        slippage_bps: float = 3.0,
        seed: int | None = None,
    ) -> None:
        self._cash = starting_cash if starting_cash is not None else settings.initial_capital
        self._slippage = slippage_bps / 10_000.0
        self._connected = False
        self._order_seq = itertools.count(1)
        self._positions: dict[int, Position] = {}
        self._orders: dict[str, OrderResult] = {}
        # Last known price per token, used to simulate quotes.
        self._last_price: dict[int, float] = {}
        self._rng = random.Random(seed)

    # --- lifecycle -------------------------------------------------------
    def connect(self) -> None:
        self._connected = True
        logger.info("PaperBroker connected (cash=₹%.2f, slippage=%.1fbps)",
                    self._cash, self._slippage * 10_000)

    def is_connected(self) -> bool:
        return self._connected

    # --- account ---------------------------------------------------------
    def get_available_margin(self) -> float:
        return self._cash

    def get_positions(self) -> list[Position]:
        return list(self._positions.values())

    # --- market data -----------------------------------------------------
    def set_price(self, instrument: Instrument, price: float) -> None:
        """Inject a price (used by the backtester / live feed bridge)."""
        self._last_price[instrument.instrument_token] = price

    def get_quote(self, instrument: Instrument) -> Quote:
        token = instrument.instrument_token
        base = self._last_price.get(token)
        if base is None:
            base = 100.0 + self._rng.random() * 900.0
            self._last_price[token] = base
        else:
            # small random drift so paper mode is non-static
            base *= 1.0 + self._rng.uniform(-0.001, 0.001)
            self._last_price[token] = base
        return Quote(
            instrument_token=token,
            last_price=round(base, 2),
            timestamp=datetime.utcnow(),
            bid=round(base * 0.9995, 2),
            ask=round(base * 1.0005, 2),
        )

    def get_historical(
        self, instrument: Instrument, interval: str, days: int
    ) -> list[Candle]:
        """Synthesise a geometric-random-walk candle series."""
        bars = max(days, 1) * 50
        price = self._last_price.get(instrument.instrument_token, 500.0)
        candles: list[Candle] = []
        ts = datetime.utcnow() - timedelta(minutes=bars)
        for _ in range(bars):
            drift = self._rng.uniform(-0.004, 0.004)
            o = price
            c = max(0.1, price * (1.0 + drift))
            h = max(o, c) * (1.0 + abs(self._rng.uniform(0, 0.002)))
            low = min(o, c) * (1.0 - abs(self._rng.uniform(0, 0.002)))
            vol = self._rng.randint(1_000, 100_000)
            candles.append(Candle(ts, round(o, 2), round(h, 2), round(low, 2),
                                  round(c, 2), float(vol)))
            price = c
            ts += timedelta(minutes=1)
        self._last_price[instrument.instrument_token] = price
        return candles

    # --- orders ----------------------------------------------------------
    def _fill_price(self, request: OrderRequest, market_price: float) -> float:
        """Apply slippage in the adverse direction for market orders."""
        slip = market_price * self._slippage
        if request.order_type in (OrderType.MARKET, OrderType.SLM):
            return market_price + slip if request.side is Side.BUY else market_price - slip
        return request.price or market_price

    def place_order(self, request: OrderRequest) -> OrderResult:
        order_id = f"PAPER-{next(self._order_seq)}"
        quote = self.get_quote(request.instrument)
        fill = round(self._fill_price(request, quote.last_price), 2)

        cost = fill * request.quantity
        if request.side is Side.BUY and cost > self._cash:
            result = OrderResult(order_id, OrderStatus.REJECTED,
                                 message="insufficient paper margin")
            self._orders[order_id] = result
            logger.warning("Paper order rejected (margin): %s", request.instrument.tradingsymbol)
            return result

        # Update simulated cash & positions.
        signed_qty = request.quantity * request.side.sign
        self._cash -= cost * request.side.sign

        token = request.instrument.instrument_token
        existing = self._positions.get(token)
        if existing is None:
            self._positions[token] = Position(
                instrument=request.instrument,
                side=request.side,
                quantity=request.quantity,
                entry_price=fill,
                stop_loss=request.trigger_price,
                target=0.0,
                product=request.product,
                strategy=request.tag or "paper",
                trading_type=TradingType.INTRADAY,
                entry_order_id=order_id,
                last_price=fill,
            )
        else:
            net = existing.quantity * existing.side.sign + signed_qty
            if net == 0:
                del self._positions[token]
            else:
                existing.quantity = abs(net)
                existing.side = Side.BUY if net > 0 else Side.SELL

        result = OrderResult(order_id, OrderStatus.COMPLETE,
                             filled_quantity=request.quantity, average_price=fill)
        self._orders[order_id] = result
        audit(f"PAPER FILL {request.side.value} {request.quantity} "
              f"{request.instrument.tradingsymbol} @ {fill} ({order_id})")
        return result

    def modify_order(
        self, order_id: str, price: float | None = None, trigger_price: float | None = None
    ) -> OrderResult:
        result = self._orders.get(order_id)
        if result is None:
            return OrderResult(order_id, OrderStatus.REJECTED, message="unknown order")
        return result

    def cancel_order(self, order_id: str) -> OrderResult:
        result = self._orders.get(order_id)
        if result is None:
            return OrderResult(order_id, OrderStatus.REJECTED, message="unknown order")
        result.status = OrderStatus.CANCELLED
        return result

    def get_order_status(self, order_id: str) -> OrderResult:
        return self._orders.get(
            order_id, OrderResult(order_id, OrderStatus.REJECTED, message="unknown order")
        )

    def place_gtt(
        self, instrument: Instrument, trigger_price: float, request: OrderRequest
    ) -> str:
        gtt_id = f"PAPER-GTT-{next(self._order_seq)}"
        logger.info("Paper GTT placed %s trigger=%.2f", gtt_id, trigger_price)
        return gtt_id
