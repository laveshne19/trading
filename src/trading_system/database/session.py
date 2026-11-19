"""Engine + session factory, lazily initialized from config.

Callers get a ``sqlalchemy.orm.Session`` via ``SessionLocal()``. In
tests, override the engine with ``reset_engine()`` + monkeypatching
``get_engine``.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from trading_system.config import DatabaseConfig, get_config

_engine: Optional[Engine] = None
_session_factory: Optional[sessionmaker[Session]] = None


def create_engine_from_config(cfg: DatabaseConfig) -> Engine:
    """Build an Engine from an explicit config. Doesn't cache globals."""
    return create_engine(
        cfg.url,
        echo=cfg.echo,
        pool_pre_ping=True,
        future=True,
    )


def get_engine() -> Engine:
    global _engine, _session_factory
    if _engine is None:
        _engine = create_engine_from_config(get_config().database)
        _session_factory = sessionmaker(
            bind=_engine, expire_on_commit=False, future=True
        )
    return _engine


def SessionLocal() -> Session:
    """Open a new SQLAlchemy session bound to the shared engine."""
    get_engine()  # ensures factory is initialized
    assert _session_factory is not None
    return _session_factory()


def reset_engine() -> None:
    """Dispose the cached engine. For tests or configuration reloads."""
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _session_factory = None
