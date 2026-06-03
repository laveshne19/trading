"""Create all database tables. Run: ``python -m app.db.init_db``."""
from __future__ import annotations

from app.db.models import Base
from app.db.session import get_engine
from app.logging_config import get_logger, setup_logging

logger = get_logger(__name__)


def init_db() -> None:
    engine = get_engine()
    Base.metadata.create_all(engine)
    logger.info("Database tables created (%d tables).", len(Base.metadata.tables))


if __name__ == "__main__":
    setup_logging()
    init_db()
