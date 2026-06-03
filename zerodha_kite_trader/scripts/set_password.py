"""Generate a dashboard password hash for .env.

Usage:
    python scripts/set_password.py
    python scripts/set_password.py "my-strong-password"

Copy the printed DASHBOARD_PASSWORD_HASH into your .env. This replaces the
plaintext DASHBOARD_PASSWORD fallback with a securely hashed credential.
Also prints a random DASHBOARD_SECRET_KEY you should set so session cookies
survive restarts and can't be forged.
"""
from __future__ import annotations

import getpass
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.api.auth import hash_password


def main() -> int:
    if len(sys.argv) > 1:
        password = sys.argv[1]
    else:
        password = getpass.getpass("New dashboard password: ")
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            print("Passwords do not match.")
            return 1
    if len(password) < 8:
        print("Please use at least 8 characters.")
        return 1

    print("\nAdd these lines to your .env:\n")
    print(f"DASHBOARD_PASSWORD_HASH={hash_password(password)}")
    print(f"DASHBOARD_SECRET_KEY={secrets.token_urlsafe(48)}")
    print("\n(You can then remove or ignore DASHBOARD_PASSWORD.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
