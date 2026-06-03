"""Strategy library."""
from app.strategies.base import Strategy
from app.strategies.breakout import BreakoutStrategy
from app.strategies.mcx import MCXStrategy
from app.strategies.mean_reversion import MeanReversionStrategy
from app.strategies.options import OptionsStrategy
from app.strategies.registry import build_default_strategies
from app.strategies.trend_following import TrendFollowingStrategy

__all__ = [
    "Strategy",
    "TrendFollowingStrategy",
    "BreakoutStrategy",
    "OptionsStrategy",
    "MeanReversionStrategy",
    "MCXStrategy",
    "build_default_strategies",
]
