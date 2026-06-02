"""Trade-quality model.

Wraps an XGBoost (or sklearn GradientBoosting fallback) classifier that
estimates the probability a trade reaches its target before its stop. Exposes:

* ``predict_proba`` — probability of success (0..1),
* ``expected_return`` — probability-weighted R multiple,
* ``confidence`` — distance of the probability from 0.5, scaled to 0..1.

Until a model is trained, a transparent heuristic derived from the opportunity
score and reward:risk is used, so the pipeline always returns sane numbers.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from app.config import settings
from app.logging_config import get_logger
from app.ml.features import FEATURE_NAMES

logger = get_logger(__name__)

_MODEL_PATH = Path("models/trade_quality.joblib")

try:  # pragma: no cover - optional
    import xgboost as xgb  # type: ignore

    _HAS_XGB = True
except Exception:  # pragma: no cover
    xgb = None  # type: ignore
    _HAS_XGB = False


class TradeQualityModel:
    """Probabilistic filter over candidate trades."""

    def __init__(self, version: str = "heuristic-v0") -> None:
        self._model = None
        self._version = version

    @property
    def version(self) -> str:
        return self._version

    @property
    def is_trained(self) -> bool:
        return self._model is not None

    # --- persistence -----------------------------------------------------
    def load(self, path: Path = _MODEL_PATH) -> bool:
        if not path.exists():
            logger.info("No trained model at %s; using heuristic fallback.", path)
            return False
        try:
            import joblib

            payload = joblib.load(path)
            self._model = payload["model"]
            self._version = payload.get("version", "loaded")
            logger.info("Loaded ML model version=%s", self._version)
            return True
        except Exception as exc:
            logger.warning("Failed to load model: %s; using heuristic.", exc)
            return False

    def save(self, path: Path = _MODEL_PATH) -> None:
        if self._model is None:
            return
        import joblib

        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump({"model": self._model, "version": self._version,
                     "features": FEATURE_NAMES}, path)
        logger.info("Saved ML model to %s", path)

    def set_model(self, model, version: str) -> None:  # noqa: ANN001
        self._model = model
        self._version = version

    # --- inference -------------------------------------------------------
    def predict_proba(self, feature_vector: list[float]) -> float:
        if self._model is None:
            return self._heuristic_proba(feature_vector)
        x = np.asarray(feature_vector, dtype=float).reshape(1, -1)
        try:
            proba = float(self._model.predict_proba(x)[0][1])
        except Exception:
            return self._heuristic_proba(feature_vector)
        return max(0.0, min(1.0, proba))

    @staticmethod
    def _heuristic_proba(feature_vector: list[float]) -> float:
        """Map opportunity score (index 0) to a calibrated-ish probability."""
        score = feature_vector[0] if feature_vector else 50.0
        # score 50 -> 0.45, score 80 -> ~0.60, score 100 -> ~0.70
        return max(0.0, min(0.95, 0.30 + (score / 100.0) * 0.40))

    def expected_return(self, proba: float, reward_risk: float) -> float:
        """Expected R multiple = p*reward − (1−p)*1 (risk = 1R)."""
        return proba * reward_risk - (1.0 - proba)

    @staticmethod
    def confidence(proba: float) -> float:
        return min(1.0, abs(proba - 0.5) * 2.0)

    def passes_threshold(self, proba: float) -> bool:
        return proba >= settings.ml_confidence_threshold


_model: TradeQualityModel | None = None


def get_model() -> TradeQualityModel:
    global _model
    if _model is None:
        _model = TradeQualityModel()
        _model.load()
    return _model
