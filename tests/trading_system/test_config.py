"""Unit tests for config loading.

No network, no database. Exercises the env-var contract so a typo in
.env.example gets caught at CI time, not in production.
"""
from __future__ import annotations

import pytest

from trading_system.config import (
    AppConfig,
    ConfigError,
    DatabaseConfig,
    GrowwConfig,
    reset_config,
)


@pytest.fixture(autouse=True)
def _clear_config_cache():
    reset_config()
    yield
    reset_config()


def test_groww_config_requires_api_key(monkeypatch):
    monkeypatch.delenv("GROWW_API_KEY", raising=False)
    with pytest.raises(ConfigError, match="GROWW_API_KEY"):
        GrowwConfig.from_env()


def test_groww_config_reads_secret_and_timeout(monkeypatch):
    monkeypatch.setenv("GROWW_API_KEY", "k")
    monkeypatch.setenv("GROWW_TOTP_SECRET", "s")
    monkeypatch.setenv("GROWW_REQUEST_TIMEOUT_S", "25")
    cfg = GrowwConfig.from_env()
    assert cfg.api_key == "k"
    assert cfg.totp_secret == "s"
    assert cfg.request_timeout_s == 25


def test_database_config_requires_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(ConfigError, match="DATABASE_URL"):
        DatabaseConfig.from_env()


def test_app_config_defaults_paper_trading_on(monkeypatch):
    monkeypatch.setenv("GROWW_API_KEY", "k")
    monkeypatch.setenv("DATABASE_URL", "postgresql://x/y")
    monkeypatch.delenv("PAPER_TRADING", raising=False)
    cfg = AppConfig.from_env()
    assert cfg.paper_trading is True, "Paper trading MUST default to on"


def test_app_config_paper_trading_can_be_disabled(monkeypatch):
    monkeypatch.setenv("GROWW_API_KEY", "k")
    monkeypatch.setenv("DATABASE_URL", "postgresql://x/y")
    monkeypatch.setenv("PAPER_TRADING", "false")
    cfg = AppConfig.from_env()
    assert cfg.paper_trading is False
