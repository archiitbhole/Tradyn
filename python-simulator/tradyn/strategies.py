"""The four rule-based trading strategies.

Every trader sees the same market information (a MarketView) — each strategy
turns it into a different decision. No learning, no prediction: just rules.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

import numpy as np

BUY, HOLD, SELL = 1, 0, -1
ACTION_NAMES = {BUY: "BUY", HOLD: "HOLD", SELL: "SELL"}


@dataclass(frozen=True)
class MarketView:
    """Read-only snapshot of the market that every trader receives (stage 1)."""

    step: int
    price: float
    prices: np.ndarray  # full price history, current price last

    def recent_return(self, lookback: int) -> float:
        if len(self.prices) <= lookback:
            return 0.0
        past = self.prices[-1 - lookback]
        return float(self.prices[-1] / past - 1.0)

    def moving_average(self, window: int) -> float:
        return float(np.mean(self.prices[-window:]))


class Strategy(ABC):
    name: str = "Strategy"
    rule: str = ""
    behaviour: str = ""

    @abstractmethod
    def decide(self, view: MarketView, rng: np.random.Generator) -> int:
        """Return BUY, SELL or HOLD."""

    def quantity(self, rng: np.random.Generator, max_qty: int) -> int:
        return int(rng.integers(1, max_qty + 1))


class RandomStrategy(Strategy):
    name = "Random"
    rule = "Picks BUY, SELL or HOLD at random."
    behaviour = "Unpredictable"

    def decide(self, view, rng):
        return int(rng.choice((BUY, SELL, HOLD)))


class MomentumStrategy(Strategy):
    name = "Momentum"
    rule = "Follows the trend: rising -> BUY, falling -> SELL."
    behaviour = "More active"

    def __init__(self, lookback: int = 5, threshold: float = 0.002):
        self.lookback, self.threshold = lookback, threshold

    def decide(self, view, rng):
        r = view.recent_return(self.lookback)
        if r > self.threshold:
            return BUY
        if r < -self.threshold:
            return SELL
        return HOLD


class MeanReversionStrategy(Strategy):
    name = "Mean Reversion"
    rule = "Compares price with its recent average; trades when it deviates far."
    behaviour = "Counter-trend"

    def __init__(self, window: int = 10, threshold: float = 0.01):
        self.window, self.threshold = window, threshold

    def decide(self, view, rng):
        if len(view.prices) < self.window:
            return HOLD
        deviation = view.price / view.moving_average(self.window) - 1.0
        if deviation > self.threshold:
            return SELL
        if deviation < -self.threshold:
            return BUY
        return HOLD


class RiskAverseStrategy(Strategy):
    name = "Risk-Averse"
    rule = "Trades less often and reacts only to stronger signals."
    behaviour = "Conservative"

    def __init__(self, lookback: int = 5, threshold: float = 0.015, act_probability: float = 0.5):
        self.lookback, self.threshold, self.act_probability = lookback, threshold, act_probability

    def decide(self, view, rng):
        r = view.recent_return(self.lookback)
        if abs(r) <= self.threshold or rng.random() > self.act_probability:
            return HOLD
        return BUY if r > 0 else SELL

    def quantity(self, rng, max_qty):
        return int(rng.integers(1, max(1, max_qty // 2) + 1))   # smaller orders


STRATEGY_CLASSES = {
    cls.name: cls for cls in (RandomStrategy, MomentumStrategy, MeanReversionStrategy, RiskAverseStrategy)
}


def make_strategy(name: str) -> Strategy:
    return STRATEGY_CLASSES[name]()
