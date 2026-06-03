"""Tests for dashboard authentication and the login-gated API."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api import auth
from app.api.server import app


# --- password hashing ------------------------------------------------------
def test_hash_and_verify_password():
    h = auth.hash_password("correct horse battery staple")
    assert h.startswith("pbkdf2_sha256$")
    assert auth.verify_password("correct horse battery staple", h)
    assert not auth.verify_password("wrong", h)


def test_verify_password_rejects_garbage():
    assert not auth.verify_password("x", "not-a-valid-hash")


def test_session_token_roundtrip():
    token = auth.create_session_token("admin")
    assert auth.verify_session_token(token) == "admin"


def test_session_token_tamper_detected():
    token = auth.create_session_token("admin")
    assert auth.verify_session_token(token + "tamper") is None
    assert auth.verify_session_token("garbage") is None
    assert auth.verify_session_token(None) is None


def test_expired_session_rejected():
    token = auth.create_session_token("admin", ttl_seconds=-1)
    assert auth.verify_session_token(token) is None


def test_check_credentials_plaintext_fallback():
    # defaults: username=admin, password=admin
    assert auth.check_credentials("admin", "admin")
    assert not auth.check_credentials("admin", "nope")
    assert not auth.check_credentials("root", "admin")


# --- HTTP flow -------------------------------------------------------------
@pytest.fixture
def client() -> TestClient:
    return TestClient(app, follow_redirects=False)


def test_root_redirects_to_login_when_anonymous(client):
    r = client.get("/")
    assert r.status_code == 303
    assert r.headers["location"] == "/login"


def test_protected_api_returns_401_when_anonymous(client):
    assert client.get("/api/state").status_code == 401
    assert client.get("/api/signals").status_code == 401


def test_health_is_public(client):
    assert client.get("/health").status_code == 200


def test_login_page_renders(client):
    r = client.get("/login")
    assert r.status_code == 200
    assert "Sign in" in r.text


def test_bad_login_redirects_with_error(client):
    r = client.post("/login", data={"username": "admin", "password": "wrong"})
    assert r.status_code == 303
    assert "error" in r.headers["location"]


def test_good_login_sets_cookie_and_grants_access():
    client = TestClient(app)  # follows redirects, keeps cookies
    r = client.post("/login", data={"username": "admin", "password": "admin"})
    assert r.status_code == 200
    assert "Kite Automated Trading" in r.text
    assert client.get("/api/state").status_code == 200
    # logout clears the session
    client.get("/logout")
    assert TestClient(app, follow_redirects=False).get("/api/state").status_code == 401
