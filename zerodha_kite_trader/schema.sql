-- ===========================================================================
-- Zerodha Kite Trading System — PostgreSQL schema
-- This mirrors app/db/models.py. The application can create tables itself via
-- `python -m app.db.init_db`; this file is provided for manual provisioning,
-- review and migrations tooling.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS instruments (
    id                  BIGSERIAL PRIMARY KEY,
    instrument_token    BIGINT UNIQUE NOT NULL,
    tradingsymbol       VARCHAR(64) NOT NULL,
    name                VARCHAR(128) DEFAULT '',
    exchange            VARCHAR(8)  NOT NULL,
    segment             VARCHAR(16) NOT NULL,
    instrument_type     VARCHAR(8)  DEFAULT 'EQ',
    lot_size            INTEGER     DEFAULT 1,
    tick_size           DOUBLE PRECISION DEFAULT 0.05,
    strike              DOUBLE PRECISION,
    expiry              TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_instruments_symbol ON instruments (tradingsymbol);

CREATE TABLE IF NOT EXISTS signals (
    id                  BIGSERIAL PRIMARY KEY,
    created_at          TIMESTAMP DEFAULT NOW(),
    tradingsymbol       VARCHAR(64) NOT NULL,
    exchange            VARCHAR(8)  NOT NULL,
    strategy            VARCHAR(64) NOT NULL,
    signal_type         VARCHAR(32) DEFAULT '',
    side                VARCHAR(4)  NOT NULL,
    entry_price         DOUBLE PRECISION NOT NULL,
    stop_loss           DOUBLE PRECISION NOT NULL,
    target              DOUBLE PRECISION NOT NULL,
    opportunity_score   DOUBLE PRECISION DEFAULT 0,
    ml_confidence       DOUBLE PRECISION DEFAULT 0,
    reward_risk         DOUBLE PRECISION DEFAULT 0,
    acted_upon          BOOLEAN DEFAULT FALSE,
    rationale           TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_signals_created ON signals (created_at);
CREATE INDEX IF NOT EXISTS ix_signals_strategy ON signals (strategy);

CREATE TABLE IF NOT EXISTS orders (
    id                  BIGSERIAL PRIMARY KEY,
    broker_order_id     VARCHAR(64) NOT NULL,
    created_at          TIMESTAMP DEFAULT NOW(),
    tradingsymbol       VARCHAR(64) NOT NULL,
    exchange            VARCHAR(8)  NOT NULL,
    side                VARCHAR(4)  NOT NULL,
    order_type          VARCHAR(8)  NOT NULL,
    product             VARCHAR(8)  NOT NULL,
    quantity            INTEGER     NOT NULL,
    price               DOUBLE PRECISION DEFAULT 0,
    trigger_price       DOUBLE PRECISION DEFAULT 0,
    status              VARCHAR(16) DEFAULT 'PENDING',
    filled_quantity     INTEGER DEFAULT 0,
    average_price       DOUBLE PRECISION DEFAULT 0,
    message             TEXT DEFAULT '',
    strategy            VARCHAR(64) DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_orders_broker_id ON orders (broker_order_id);

CREATE TABLE IF NOT EXISTS trades (
    id                  BIGSERIAL PRIMARY KEY,
    tradingsymbol       VARCHAR(64) NOT NULL,
    exchange            VARCHAR(8)  NOT NULL,
    strategy            VARCHAR(64) NOT NULL,
    side                VARCHAR(4)  NOT NULL,
    quantity            INTEGER     NOT NULL,
    entry_price         DOUBLE PRECISION NOT NULL,
    exit_price          DOUBLE PRECISION,
    stop_loss           DOUBLE PRECISION DEFAULT 0,
    target              DOUBLE PRECISION DEFAULT 0,
    pnl                 DOUBLE PRECISION DEFAULT 0,
    charges             DOUBLE PRECISION DEFAULT 0,
    net_pnl             DOUBLE PRECISION DEFAULT 0,
    status              VARCHAR(16) DEFAULT 'OPEN',
    exit_reason         VARCHAR(32) DEFAULT '',
    opened_at           TIMESTAMP DEFAULT NOW(),
    closed_at           TIMESTAMP,
    signal_id           BIGINT REFERENCES signals (id)
);
CREATE INDEX IF NOT EXISTS ix_trades_status ON trades (status);
CREATE INDEX IF NOT EXISTS ix_trades_opened ON trades (opened_at);

CREATE TABLE IF NOT EXISTS market_data (
    id                  BIGSERIAL PRIMARY KEY,
    instrument_token    BIGINT NOT NULL,
    timestamp           TIMESTAMP NOT NULL,
    interval            VARCHAR(8) DEFAULT 'minute',
    open                DOUBLE PRECISION NOT NULL,
    high                DOUBLE PRECISION NOT NULL,
    low                 DOUBLE PRECISION NOT NULL,
    close               DOUBLE PRECISION NOT NULL,
    volume              DOUBLE PRECISION DEFAULT 0,
    oi                  DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS ix_market_data_token_ts ON market_data (instrument_token, timestamp);

CREATE TABLE IF NOT EXISTS strategy_logs (
    id                  BIGSERIAL PRIMARY KEY,
    created_at          TIMESTAMP DEFAULT NOW(),
    strategy            VARCHAR(64) NOT NULL,
    level               VARCHAR(16) DEFAULT 'INFO',
    message             TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_strategy_logs_strategy ON strategy_logs (strategy);

CREATE TABLE IF NOT EXISTS performance_metrics (
    id                  BIGSERIAL PRIMARY KEY,
    as_of               TIMESTAMP DEFAULT NOW(),
    scope               VARCHAR(32) DEFAULT 'overall',
    equity              DOUBLE PRECISION DEFAULT 0,
    realized_pnl        DOUBLE PRECISION DEFAULT 0,
    unrealized_pnl      DOUBLE PRECISION DEFAULT 0,
    drawdown_pct        DOUBLE PRECISION DEFAULT 0,
    win_rate            DOUBLE PRECISION DEFAULT 0,
    trades_count        INTEGER DEFAULT 0,
    profit_factor       DOUBLE PRECISION DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ml_predictions (
    id                  BIGSERIAL PRIMARY KEY,
    created_at          TIMESTAMP DEFAULT NOW(),
    tradingsymbol       VARCHAR(64) NOT NULL,
    strategy            VARCHAR(64) NOT NULL,
    probability         DOUBLE PRECISION NOT NULL,
    expected_return     DOUBLE PRECISION DEFAULT 0,
    confidence          DOUBLE PRECISION DEFAULT 0,
    model_version       VARCHAR(32) DEFAULT '',
    features_json       TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ix_ml_predictions_symbol ON ml_predictions (tradingsymbol);
