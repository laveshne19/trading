"""Authentication helpers for the dashboard.

Stdlib-only (no extra dependencies):

* passwords are hashed with PBKDF2-HMAC-SHA256 (``hash_password`` /
  ``verify_password``),
* sessions are stateless, HMAC-signed cookies with an expiry
  (``create_session_token`` / ``verify_session_token``).

For production set ``DASHBOARD_PASSWORD_HASH`` (via ``scripts/set_password.py``)
and a long random ``DASHBOARD_SECRET_KEY``. The plaintext ``DASHBOARD_PASSWORD``
fallback exists only so the app is usable on first run.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time

from app.config import settings

_ITERATIONS = 200_000
_ALGO = "pbkdf2_sha256"


# --- password hashing ------------------------------------------------------
def hash_password(password: str, salt: str | None = None) -> str:
    """Return a ``pbkdf2_sha256$iterations$salt$hash`` string."""
    salt = salt or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _ITERATIONS)
    return f"{_ALGO}${_ITERATIONS}${salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Constant-time verification of a password against a stored hash."""
    try:
        algo, iterations, salt, expected = stored.split("$")
        if algo != _ALGO:
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iterations))
        return hmac.compare_digest(dk.hex(), expected)
    except Exception:
        return False


def check_credentials(username: str, password: str) -> bool:
    """Validate a login attempt against configured username + password."""
    if not hmac.compare_digest(username, settings.dashboard_username):
        return False
    if settings.dashboard_password_hash:
        return verify_password(password, settings.dashboard_password_hash)
    # First-run convenience: plaintext comparison (constant-time).
    return hmac.compare_digest(password, settings.dashboard_password)


# --- session cookies -------------------------------------------------------
def _secret() -> bytes:
    return (settings.dashboard_secret_key or settings.dashboard_api_key or "change-me").encode()


def create_session_token(username: str, ttl_seconds: int = 12 * 3600) -> str:
    payload = {"u": username, "exp": int(time.time()) + ttl_seconds}
    raw = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    sig = hmac.new(_secret(), raw.encode(), hashlib.sha256).hexdigest()
    return f"{raw}.{sig}"


def verify_session_token(token: str | None) -> str | None:
    """Return the username if the token is valid and unexpired, else None."""
    if not token or "." not in token:
        return None
    try:
        raw, sig = token.rsplit(".", 1)
        expected = hmac.new(_secret(), raw.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        padded = raw + "=" * (-len(raw) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode()))
        if int(payload.get("exp", 0)) < time.time():
            return None
        return payload.get("u")
    except Exception:
        return None
