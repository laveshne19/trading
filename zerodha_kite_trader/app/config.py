"""Central configuration loaded from environment variables.

All tunables live here so the rest of the codebase never reads ``os.environ``
directly. Values are validated and typed via pydantic-settings.
"""
from __future__ import annotations

from datetime import time
from enum import Enum
from functools import lru_cache

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class BrokerMode(str, Enum):
    PAPER = "paper"
    KITE = "kite"


class Environment(str, Enum):
    DEVELOPMENT = "development"
    PRODUCTION = "production"


def _parse_time(value: str) -> time:
    hh, mm = value.strip().split(":")
    return time(int(hh), int(mm))


class Settings(BaseSettings):
    """Strongly-typed application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Runtime ---
    broker: BrokerMode = BrokerMode.PAPER
    dry_run: bool = True
    env: Environment = Environment.DEVELOPMENT
    log_level: str = "INFO"
    timezone: str = "Asia/Kolkata"

    # --- Capital & risk ---
    initial_capital: float = 100_000.0
    risk_per_trade_pct: float = 1.0
    max_daily_loss_pct: float = 3.0
    max_drawdown_pct: float = 10.0
    max_open_positions: int = 3
    min_opportunity_score: float = 80.0
    ml_confidence_threshold: float = 0.55

    # --- Kite ---
    kite_api_key: str = ""
    kite_api_secret: str = ""
    kite_access_token: str = ""
    kite_user_id: str = ""

    # --- Postgres ---
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "trading"
    postgres_user: str = "trading"
    postgres_password: str = "change-me"
    database_url: str = ""

    # --- Redis ---
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: str = ""

    # --- Telegram ---
    telegram_enabled: bool = False
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # --- Dashboard ---
    dashboard_host: str = "0.0.0.0"
    dashboard_port: int = 8000
    dashboard_api_key: str = "change-me"
    # Login (web UI). Set a password hash via scripts/set_password.py for
    # production; the plaintext fallback exists only for first-run convenience.
    dashboard_auth_enabled: bool = True
    dashboard_username: str = "admin"
    dashboard_password: str = "admin"
    dashboard_password_hash: str = ""
    dashboard_secret_key: str = ""  # signs session cookies; set a long random value

    # --- Session windows (stored as strings, exposed as time) ---
    equity_session_start: str = "09:15"
    equity_session_end: str = "15:30"
    square_off_time: str = "15:15"
    mcx_session_end: str = "23:30"

    # --- Derived ---------------------------------------------------------
    @computed_field  # type: ignore[prop-decorator]
    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def redis_url(self) -> str:
        auth = f":{self.redis_password}@" if self.redis_password else ""
        return f"redis://{auth}{self.redis_host}:{self.redis_port}/{self.redis_db}"

    @property
    def risk_per_trade(self) -> float:
        return self.risk_per_trade_pct / 100.0

    @property
    def max_daily_loss(self) -> float:
        return self.max_daily_loss_pct / 100.0

    @property
    def max_drawdown(self) -> float:
        return self.max_drawdown_pct / 100.0

    @property
    def equity_start_t(self) -> time:
        return _parse_time(self.equity_session_start)

    @property
    def equity_end_t(self) -> time:
        return _parse_time(self.equity_session_end)

    @property
    def square_off_t(self) -> time:
        return _parse_time(self.square_off_time)

    @property
    def mcx_end_t(self) -> time:
        return _parse_time(self.mcx_session_end)

    @property
    def is_live(self) -> bool:
        """True only when configured to actually place real orders."""
        return self.broker is BrokerMode.KITE and not self.dry_run


@lru_cache
def get_settings() -> Settings:
    """Return a cached singleton of the settings."""
    return Settings()


settings = get_settings()
