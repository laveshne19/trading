"""Train the trade-quality model from historical closed trades.

Pulls closed trades + their originating signals from the DB, reconstructs the
feature vector, labels each trade win(1)/loss(0) by net P&L, and fits an
XGBoost classifier (or sklearn GradientBoosting fallback). Run:

    python -m app.ml.trainer
"""
from __future__ import annotations

import numpy as np

from app.db import repository
from app.logging_config import get_logger, setup_logging
from app.ml.features import FEATURE_NAMES
from app.ml.model import TradeQualityModel

logger = get_logger(__name__)

try:  # pragma: no cover
    import xgboost as xgb  # type: ignore

    _HAS_XGB = True
except Exception:  # pragma: no cover
    _HAS_XGB = False

from sklearn.ensemble import GradientBoostingClassifier  # noqa: E402
from sklearn.metrics import roc_auc_score  # noqa: E402
from sklearn.model_selection import train_test_split  # noqa: E402


def _build_dataset() -> tuple[np.ndarray, np.ndarray]:
    """Reconstruct (X, y) from closed trades joined to their signals."""
    trades = repository.get_closed_trades(days=3650)
    rows: list[list[float]] = []
    labels: list[int] = []
    for t in trades:
        sig = t.signal
        if sig is None:
            continue
        # Recover features from the signal row's stored fields (subset) + defaults.
        feats = {
            "trend_strength": 0.0,
            "rvol": 1.0,
            "atr_pct": 0.0,
            "rsi": 50.0,
            "macd_hist": 0.0,
            "supertrend_dir": 0.0,
            "ema_alignment": 0.0,
            "vwap_dist": 0.0,
            "market_breadth": 0.5,
            "pcr": 1.0,
            "oi_change": 0.0,
            "pattern_strength": 0.0,
        }
        direction_sign = 1.0 if sig.side == "BUY" else -1.0
        vec = [
            float(sig.opportunity_score),
            *[feats[k] for k in FEATURE_NAMES[1:-1]],
            direction_sign,
        ]
        rows.append(vec)
        labels.append(1 if t.net_pnl > 0 else 0)
    return np.asarray(rows, dtype=float), np.asarray(labels, dtype=int)


def train(min_samples: int = 50) -> TradeQualityModel | None:
    X, y = _build_dataset()
    if len(y) < min_samples or len(set(y.tolist())) < 2:
        logger.warning("Not enough labelled trades to train (have %d). "
                       "Keep trading in paper mode to accumulate data.", len(y))
        return None

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )

    if _HAS_XGB:
        clf = xgb.XGBClassifier(
            n_estimators=300, max_depth=4, learning_rate=0.05,
            subsample=0.9, colsample_bytree=0.9, eval_metric="logloss",
        )
        version = f"xgb-{len(y)}"
    else:
        clf = GradientBoostingClassifier(n_estimators=200, max_depth=3, learning_rate=0.05)
        version = f"gbdt-{len(y)}"

    clf.fit(X_train, y_train)
    try:
        auc = roc_auc_score(y_test, clf.predict_proba(X_test)[:, 1])
        logger.info("Validation AUC: %.3f (n=%d, %s)", auc, len(y), version)
    except Exception:
        auc = float("nan")

    model = TradeQualityModel(version=version)
    model.set_model(clf, version)
    model.save()
    logger.info("Training complete. Model version=%s", version)
    return model


if __name__ == "__main__":
    setup_logging()
    train()
