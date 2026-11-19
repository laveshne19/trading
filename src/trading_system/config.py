"""Environment-driven configuration for the trading system.

All secrets come from env vars or a local .env (which is gitignored).
Never commit real values. .env.example documents the full set.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


class ConfigError(RuntimeError):
    """Raised when a required env var is missing or malformed."""


def _require(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        raise ConfigError(
            f"Missing required env var {name!r}. See .env.example."
        )
    return v


def _optional(name: str, default: str | None = None) -> str | None:
    return os.environ.get(name) or default


@dataclass(frozen=True)
class GrowwConfig:
    api_key: str
    totp_secret: str | None  # TOTP seed used by growwapi to mint tokens
    request_timeout_s: int = 10

    @classmethod
    def from_env(cls) -> "GrowwConfig":
        return cls(
            api_key=_require("GROWW_API_KEY"),
            totp_secret=_optional("GROWW_TOTP_SECRET"),
            request_timeout_s=int(_optional("GROWW_REQUEST_TIMEOUT_S", "10")),
        )


@dataclass(frozen=True)
class DatabaseConfig:
    url: str  # SQLAlchemy URL, e.g. postgresql+psycopg2://user:pw@host:5432/db
    echo: bool = False

    @classmethod
    def from_env(cls) -> "DatabaseConfig":
        return cls(
            url=_require("DATABASE_URL"),
            echo=_optional("DATABASE_ECHO", "false").lower() == "true",
        )


@dataclass(frozen=True)
class AppConfig:
    """Top-level config aggregating every subsystem."""

    groww: GrowwConfig
    database: DatabaseConfig
    paper_trading: bool  # when True, no real orders are sent
    tz: str = "Asia/Kolkata"

    @classmethod
    def from_env(cls) -> "AppConfig":
        return cls(
            groww=GrowwConfig.from_env(),
            database=DatabaseConfig.from_env(),
            paper_trading=_optional("PAPER_TRADING", "true").lower() != "false",
            tz=_optional("APP_TZ", "Asia/Kolkata") or "Asia/Kolkata",
        )


@lru_cache(maxsize=1)
def get_config() -> AppConfig:
    """Load and cache the config. Call reset_config() in tests to reload."""
    return AppConfig.from_env()


def reset_config() -> None:
    """Drop the cached config; next get_config() call re-reads env."""
    get_config.cache_clear()
