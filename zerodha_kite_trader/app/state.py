"""Cross-process runtime state snapshot.

The orchestrator publishes a live snapshot (equity, positions, risk) that the
dashboard reads. Uses Redis when available, otherwise a local JSON file, so the
dashboard works with or without Redis running.
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from app.config import settings
from app.logging_config import get_logger

logger = get_logger(__name__)

_STATE_KEY = "trading:state"
_STATE_FILE = Path("runtime_state.json")

try:  # pragma: no cover - optional
    import redis  # type: ignore

    _redis_client = redis.Redis.from_url(settings.redis_url, socket_connect_timeout=1)
    _redis_client.ping()
    _HAS_REDIS = True
    logger.info("State backend: Redis")
except Exception:  # pragma: no cover
    _redis_client = None
    _HAS_REDIS = False
    logger.info("State backend: local JSON file (Redis unavailable)")


def publish_state(snapshot: dict[str, Any]) -> None:
    snapshot = {**snapshot, "updated_at": time.time()}
    payload = json.dumps(snapshot, default=str)
    if _HAS_REDIS and _redis_client is not None:
        try:
            _redis_client.set(_STATE_KEY, payload, ex=120)
            return
        except Exception:  # pragma: no cover
            pass
    try:
        _STATE_FILE.write_text(payload)
    except Exception as exc:  # pragma: no cover
        logger.warning("Failed to persist state: %s", exc)


def read_state() -> dict[str, Any]:
    if _HAS_REDIS and _redis_client is not None:
        try:
            raw = _redis_client.get(_STATE_KEY)
            if raw:
                return json.loads(raw)
        except Exception:  # pragma: no cover
            pass
    if _STATE_FILE.exists():
        try:
            return json.loads(_STATE_FILE.read_text())
        except Exception:  # pragma: no cover
            return {}
    return {}
