"""The tradable universe and candle helpers.

In live mode the universe is built from Kite's instrument dump; the index
constituents (Nifty 50, Bank Nifty, FinNifty, a midcap basket) ship as static
lists so the scanner has a sensible default watchlist out of the box.
"""
from __future__ import annotations

import pandas as pd

from app.domain import Candle, Exchange, Instrument, Segment

# --- Index constituents (representative static baskets) -------------------- #
# These are NSE symbols. Tokens are resolved at runtime from the Kite dump;
# in paper mode a deterministic pseudo-token is derived from the symbol.
NIFTY_50 = [
    "RELIANCE", "HDFCBANK", "ICICIBANK", "INFY", "TCS", "ITC", "LT", "AXISBANK",
    "SBIN", "BHARTIARTL", "KOTAKBANK", "HINDUNILVR", "BAJFINANCE", "ASIANPAINT",
    "MARUTI", "SUNPHARMA", "TITAN", "ULTRACEMCO", "NESTLEIND", "WIPRO",
    "TATAMOTORS", "TATASTEEL", "POWERGRID", "NTPC", "HCLTECH", "M&M", "TECHM",
    "ADANIENT", "ADANIPORTS", "JSWSTEEL", "GRASIM", "HINDALCO", "DRREDDY",
    "CIPLA", "COALINDIA", "BAJAJFINSV", "BPCL", "BRITANNIA", "DIVISLAB",
    "EICHERMOT", "HEROMOTOCO", "INDUSINDBK", "ONGC", "SBILIFE", "TATACONSUM",
    "APOLLOHOSP", "BAJAJ-AUTO", "HDFCLIFE", "LTIM", "UPL",
]

BANK_NIFTY = [
    "HDFCBANK", "ICICIBANK", "AXISBANK", "SBIN", "KOTAKBANK", "INDUSINDBK",
    "BANKBARODA", "PNB", "AUBANK", "FEDERALBNK", "IDFCFIRSTB", "BANDHANBNK",
]

FIN_NIFTY = [
    "HDFCBANK", "ICICIBANK", "AXISBANK", "SBIN", "KOTAKBANK", "BAJFINANCE",
    "BAJAJFINSV", "SBILIFE", "HDFCLIFE", "ICICIGI", "ICICIPRULI", "CHOLAFIN",
]

MIDCAP_BASKET = [
    "ASHOKLEY", "AUROPHARMA", "BALKRISIND", "BHARATFORG", "CANBK", "CUMMINSIND",
    "GODREJPROP", "INDHOTEL", "JUBLFOOD", "LICHSGFIN", "MFSL", "MRF",
    "PERSISTENT", "PIIND", "POLYCAB", "SAIL", "TVSMOTOR", "VOLTAS",
]

# MCX commodity futures (symbols vary by expiry; these are roots).
MCX_INSTRUMENTS = ["GOLD", "SILVER", "CRUDEOIL", "NATURALGAS", "COPPER", "ZINC"]

# Index spot instruments for breadth & option-chain anchoring.
INDEX_SPOTS = {
    "NIFTY 50": Exchange.NSE,
    "NIFTY BANK": Exchange.NSE,
    "NIFTY FIN SERVICE": Exchange.NSE,
}


def _pseudo_token(symbol: str) -> int:
    """Deterministic non-zero token for paper mode (no real Kite dump)."""
    return abs(hash(symbol)) % 90_000_000 + 1_000_000


def make_equity_instrument(symbol: str, exchange: Exchange = Exchange.NSE) -> Instrument:
    return Instrument(
        instrument_token=_pseudo_token(symbol),
        tradingsymbol=symbol,
        name=symbol,
        exchange=exchange,
        segment=Segment.EQUITY,
        lot_size=1,
        instrument_type="EQ",
    )


def candles_to_df(candles: list[Candle]) -> pd.DataFrame:
    """Convert a list of candles to an indexed OHLCV DataFrame."""
    if not candles:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume", "oi"])
    df = pd.DataFrame(
        {
            "timestamp": [c.timestamp for c in candles],
            "open": [c.open for c in candles],
            "high": [c.high for c in candles],
            "low": [c.low for c in candles],
            "close": [c.close for c in candles],
            "volume": [c.volume for c in candles],
            "oi": [c.oi for c in candles],
        }
    )
    df.set_index("timestamp", inplace=True)
    return df


class InstrumentUniverse:
    """Resolves and caches the tradable instrument set.

    In live mode call :meth:`load_from_kite` to hydrate real tokens, lot sizes
    and the F&O / MCX chains. Without Kite, equity instruments are synthesised
    with deterministic pseudo-tokens so the pipeline runs in paper mode.
    """

    def __init__(self) -> None:
        self._by_symbol: dict[str, Instrument] = {}
        self._loaded = False

    def _ensure_default(self) -> None:
        if self._by_symbol:
            return
        symbols = set(NIFTY_50 + BANK_NIFTY + FIN_NIFTY + MIDCAP_BASKET)
        for sym in symbols:
            self._by_symbol[sym] = make_equity_instrument(sym)

    def load_from_kite(self, broker) -> None:  # noqa: ANN001 - broker is KiteBroker
        """Hydrate real instruments from Kite's dump (live mode)."""
        try:
            raw = broker._kite.instruments()  # type: ignore[attr-defined]
        except Exception:
            self._ensure_default()
            self._loaded = True
            return
        for r in raw:
            try:
                exch = Exchange(r["exchange"])
            except ValueError:
                continue
            seg = {
                "EQ": Segment.EQUITY, "FUT": Segment.FUTURES,
                "CE": Segment.OPTIONS, "PE": Segment.OPTIONS,
            }.get(r.get("instrument_type", "EQ"), Segment.EQUITY)
            if exch is Exchange.MCX:
                seg = Segment.COMMODITY
            self._by_symbol[r["tradingsymbol"]] = Instrument(
                instrument_token=int(r["instrument_token"]),
                tradingsymbol=r["tradingsymbol"],
                name=r.get("name", r["tradingsymbol"]),
                exchange=exch,
                segment=seg,
                lot_size=int(r.get("lot_size", 1)) or 1,
                tick_size=float(r.get("tick_size", 0.05)) or 0.05,
                strike=float(r["strike"]) if r.get("strike") else None,
                expiry=r.get("expiry") or None,
                instrument_type=r.get("instrument_type", "EQ"),
            )
        self._loaded = True

    def get(self, symbol: str) -> Instrument:
        self._ensure_default()
        if symbol not in self._by_symbol:
            self._by_symbol[symbol] = make_equity_instrument(symbol)
        return self._by_symbol[symbol]

    def equity_watchlist(self) -> list[Instrument]:
        self._ensure_default()
        symbols = list(dict.fromkeys(NIFTY_50 + BANK_NIFTY + FIN_NIFTY + MIDCAP_BASKET))
        return [self.get(s) for s in symbols]

    def index_constituents(self, index: str) -> list[Instrument]:
        mapping = {
            "NIFTY50": NIFTY_50,
            "BANKNIFTY": BANK_NIFTY,
            "FINNIFTY": FIN_NIFTY,
            "MIDCAP": MIDCAP_BASKET,
        }
        return [self.get(s) for s in mapping.get(index, [])]
