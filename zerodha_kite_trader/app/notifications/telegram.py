"""Telegram alerts.

Sends entry / exit / stop / target / risk / daily-summary messages via the
Telegram Bot API. Disabled gracefully (logs only) when not configured, so the
rest of the system never has to check whether Telegram is enabled.
"""
from __future__ import annotations

from app.config import settings
from app.domain import Position, Signal
from app.logging_config import get_logger

logger = get_logger(__name__)


class TelegramNotifier:
    """Thin wrapper over the Telegram Bot sendMessage API."""

    def __init__(self) -> None:
        self._enabled = (
            settings.telegram_enabled
            and bool(settings.telegram_bot_token)
            and bool(settings.telegram_chat_id)
        )
        self._url = (
            f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
            if self._enabled
            else ""
        )

    @property
    def enabled(self) -> bool:
        return self._enabled

    def _send(self, text: str) -> None:
        if not self._enabled:
            logger.debug("[telegram disabled] %s", text)
            return
        try:
            import httpx

            with httpx.Client(timeout=10.0) as client:
                resp = client.post(
                    self._url,
                    json={
                        "chat_id": settings.telegram_chat_id,
                        "text": text,
                        "parse_mode": "HTML",
                        "disable_web_page_preview": True,
                    },
                )
                if resp.status_code != 200:
                    logger.warning("Telegram send failed: %s %s", resp.status_code, resp.text)
        except Exception as exc:  # pragma: no cover - network
            logger.warning("Telegram error: %s", exc)

    # --- typed events ----------------------------------------------------
    def entry(self, position: Position) -> None:
        self._send(
            f"🟢 <b>ENTRY</b> {position.side.value} <b>{position.instrument.tradingsymbol}</b>\n"
            f"Qty: {position.quantity} @ ₹{position.entry_price:.2f}\n"
            f"SL: ₹{position.stop_loss:.2f} | Target: ₹{position.target:.2f}\n"
            f"Strategy: {position.strategy}"
        )

    def exit(self, position: Position, net_pnl: float, reason: str) -> None:
        emoji = "✅" if net_pnl >= 0 else "🔻"
        self._send(
            f"{emoji} <b>EXIT</b> {position.instrument.tradingsymbol} ({reason})\n"
            f"Net P&L: ₹{net_pnl:,.2f}"
        )

    def stop_loss(self, position: Position, net_pnl: float) -> None:
        self._send(
            f"🛑 <b>STOP LOSS</b> {position.instrument.tradingsymbol}\n"
            f"Net P&L: ₹{net_pnl:,.2f}"
        )

    def target_hit(self, position: Position, net_pnl: float) -> None:
        self._send(
            f"🎯 <b>TARGET HIT</b> {position.instrument.tradingsymbol}\n"
            f"Net P&L: ₹{net_pnl:,.2f}"
        )

    def signal(self, signal: Signal) -> None:
        self._send(
            f"📡 <b>SIGNAL</b> {signal.side.value} {signal.instrument.tradingsymbol}\n"
            f"Score: {signal.opportunity_score:.0f} | RR: {signal.reward_risk_ratio:.2f}\n"
            f"{signal.rationale}"
        )

    def risk_alert(self, message: str) -> None:
        self._send(f"⚠️ <b>RISK ALERT</b>\n{message}")

    def daily_summary(self, stats: dict) -> None:
        self._send(
            "📊 <b>DAILY SUMMARY</b>\n"
            f"Equity: ₹{stats.get('equity', 0):,.2f}\n"
            f"Realized P&L: ₹{stats.get('realized_today', 0):,.2f}\n"
            f"Trades: {stats.get('trades_count', 0)}\n"
            f"Win rate: {stats.get('win_rate', 0):.1f}%\n"
            f"Drawdown: {stats.get('drawdown_pct', 0):.2f}%"
        )


_notifier: TelegramNotifier | None = None


def get_notifier() -> TelegramNotifier:
    global _notifier
    if _notifier is None:
        _notifier = TelegramNotifier()
    return _notifier
