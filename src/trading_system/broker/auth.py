"""Groww access-token acquisition.

Separated from ``client`` so we can mock the token exchange in tests
and swap in different auth flows (TOTP seed, 6-digit TOTP code, or
pre-issued token) without touching the rest of the broker layer.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from trading_system.broker.exceptions import BrokerAuthError
from trading_system.config import GrowwConfig

log = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class AccessToken:
    token: str
    raw: dict


def fetch_access_token(cfg: GrowwConfig) -> AccessToken:
    """Exchange the configured credentials for a Groww access token.

    Imports the SDK lazily so unit tests can monkeypatch this function
    without needing growwapi installed.
    """
    try:
        from growwapi import GrowwAPI
    except ImportError as exc:  # pragma: no cover
        raise BrokerAuthError(
            "growwapi is not installed. Run `pip install growwapi`."
        ) from exc

    if not cfg.totp_secret:
        raise BrokerAuthError(
            "GROWW_TOTP_SECRET is required to mint an access token. "
            "See https://groww.in/trade-api for how to obtain one."
        )

    try:
        payload = GrowwAPI.get_access_token(
            api_key=cfg.api_key,
            secret=cfg.totp_secret,
        )
    except Exception as exc:
        raise BrokerAuthError(f"Groww token exchange failed: {exc}") from exc

    token = payload.get("access_token") if isinstance(payload, dict) else None
    if not token:
        raise BrokerAuthError(
            f"Groww returned no access_token. Raw payload keys: {list(payload or {})}"
        )
    log.info("Acquired Groww access token (len=%d)", len(token))
    return AccessToken(token=token, raw=dict(payload))
