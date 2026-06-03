"""Generate today's Kite access token.

Kite access tokens expire daily. Run this each morning before market open:

    python scripts/kite_login.py

It prints the login URL; after you log in, Kite redirects to your registered
redirect URL with a ``request_token`` query param. Paste that token back here
and the script exchanges it for an access token, which you then put in ``.env``
as ``KITE_ACCESS_TOKEN`` (or wire it into your secret store).
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings


def main() -> int:
    try:
        from kiteconnect import KiteConnect
    except ImportError:
        print("kiteconnect not installed. Run: pip install kiteconnect")
        return 1

    if not settings.kite_api_key or not settings.kite_api_secret:
        print("Set KITE_API_KEY and KITE_API_SECRET in .env first.")
        return 1

    kite = KiteConnect(api_key=settings.kite_api_key)
    print("\n1) Open this URL and log in:\n")
    print("   ", kite.login_url(), "\n")
    request_token = input("2) Paste the request_token from the redirect URL: ").strip()
    if not request_token:
        print("No request_token provided.")
        return 1

    data = kite.generate_session(request_token, api_secret=settings.kite_api_secret)
    access_token = data["access_token"]
    print("\n✅ Access token generated:\n")
    print("   ", access_token, "\n")
    print("Add this to your .env:\n")
    print(f"   KITE_ACCESS_TOKEN={access_token}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
