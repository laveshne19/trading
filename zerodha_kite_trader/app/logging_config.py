"""Structured, consistent logging for the whole application.

Call :func:`setup_logging` once at process start (``main``, dashboard, scripts).
Everywhere else simply ``from app.logging_config import get_logger``.
"""
from __future__ import annotations

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

_CONFIGURED = False

_LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def setup_logging(level: str = "INFO", log_dir: str | Path = "logs") -> None:
    """Configure the root logger with console + rotating file handlers.

    Idempotent: safe to call multiple times.
    """
    global _CONFIGURED
    if _CONFIGURED:
        return

    log_path = Path(log_dir)
    log_path.mkdir(parents=True, exist_ok=True)

    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    formatter = logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT)

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)
    root.addHandler(console)

    file_handler = RotatingFileHandler(
        log_path / "trading.log",
        maxBytes=10 * 1024 * 1024,
        backupCount=10,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    root.addHandler(file_handler)

    # Dedicated audit log for orders/trades — never lose this signal in noise.
    audit_handler = RotatingFileHandler(
        log_path / "audit.log",
        maxBytes=10 * 1024 * 1024,
        backupCount=20,
        encoding="utf-8",
    )
    audit_handler.setFormatter(formatter)
    audit_logger = logging.getLogger("audit")
    audit_logger.addHandler(audit_handler)
    audit_logger.propagate = True

    # Tame noisy third-party loggers.
    for noisy in ("urllib3", "kiteconnect", "websockets", "asyncio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    """Return a module-scoped logger."""
    return logging.getLogger(name)


def audit(message: str) -> None:
    """Write an immutable-intent audit line (orders, trades, kill switch)."""
    logging.getLogger("audit").info(message)
