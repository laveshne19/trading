"""SQLAlchemy engine and session management.

Falls back to a local SQLite file when Postgres is unreachable (useful for
tests, backtests and first-run experiments) unless ``ENV=production``.
"""
from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import Environment, settings
from app.logging_config import get_logger

logger = get_logger(__name__)

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


def _build_engine() -> Engine:
    url = settings.sqlalchemy_url
    try:
        engine = create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=10)
        # Probe the connection.
        with engine.connect():
            pass
        logger.info("Connected to database: %s", url.split("@")[-1])
        return engine
    except Exception as exc:
        if settings.env is Environment.PRODUCTION:
            raise
        logger.warning("Postgres unavailable (%s); falling back to SQLite trading.db", exc)
        return create_engine("sqlite:///trading.db", connect_args={"check_same_thread": False})


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = _build_engine()
    return _engine


def get_sessionmaker() -> sessionmaker[Session]:
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine(), expire_on_commit=False)
    return _SessionLocal


def get_session() -> Session:
    """Return a new session (caller is responsible for closing it)."""
    return get_sessionmaker()()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional scope: commit on success, rollback on error."""
    session = get_session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
