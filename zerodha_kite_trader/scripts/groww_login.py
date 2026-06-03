"""Generate / verify a Groww access token.

Groww access tokens are short-lived. Set GROWW_API_KEY and GROWW_API_SECRET
(and optionally GROWW_TOTP_SECRET) in .env, then run:

    python scripts/groww_login.py

It mints an access token and prints it; paste it into .env as
GROWW_ACCESS_TOKEN (or rely on auto-generation via the TOTP secret).

Requires: pip install growwapi pyotp
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings


def main() -> int:
    try:
        from growwapi import GrowwAPI
    except ImportError:
        print("growwapi not installed. Run: pip install growwapi pyotp")
        return 1

    if not settings.groww_api_key:
        print("Set GROWW_API_KEY (and GROWW_API_SECRET or GROWW_TOTP_SECRET) in .env first.")
        return 1

    try:
        if settings.groww_totp_secret:
            import pyotp

            totp = pyotp.TOTP(settings.groww_totp_secret).now()
            token = GrowwAPI.get_access_token(api_key=settings.groww_api_key, totp=totp)
        else:
            token = GrowwAPI.get_access_token(
                api_key=settings.groww_api_key, secret=settings.groww_api_secret
            )
    except Exception as exc:
        print(f"Failed to obtain access token: {exc}")
        print("Check your API key/secret/TOTP and the growwapi version's auth method.")
        return 1

    print("\n✅ Groww access token generated:\n")
    print("   ", token, "\n")
    print("Add to your .env:\n")
    print(f"   GROWW_ACCESS_TOKEN={token}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
