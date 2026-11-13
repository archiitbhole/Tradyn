"""Simulation settings (everything the user can change from the dashboard)."""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Dict, Optional

STRATEGY_NAMES = ("Random", "Momentum", "Mean Reversion", "Risk-Averse")

# Volatility scales how large orders can get, so it changes the size of the
# buying / selling pressure without changing the price formula itself.
VOLATILITY_LEVELS: Dict[str, float] = {"Low": 0.6, "Medium": 1.0, "High": 1.8}


@dataclass
class SimConfig:
    n_traders: int = 40
    initial_price: float = 100.0
    steps: int = 500
    sensitivity: float = 0.02          # kept small so the price cannot jump unrealistically
    max_move: Optional[float] = 0.05   # cap on |price change| per step (fraction); None = no cap
    min_price: float = 0.01            # the price can never become negative
    volatility: str = "Medium"
    initial_cash: float = 5_000.0      # equal to the starting shares' value, so buying and
    initial_shares: int = 50           # selling power start balanced (no built-in upward bias)
    base_max_qty: int = 10             # orders are 1..max_qty shares
    mix: Dict[str, float] = field(default_factory=lambda: {n: 1.0 for n in STRATEGY_NAMES})
    seed: Optional[int] = 42           # same seed + same settings = same run

    def validate(self) -> "SimConfig":
        if self.n_traders < 1:
            raise ValueError("n_traders must be at least 1")
        if self.initial_price <= 0:
            raise ValueError("initial_price must be positive")
        if self.steps < 1:
            raise ValueError("steps must be at least 1")
        if not 0 < self.sensitivity <= 0.5:
            raise ValueError("sensitivity must be in (0, 0.5]")
        if self.max_move is not None and self.max_move <= 0:
            raise ValueError("max_move must be positive or None")
        if self.volatility not in VOLATILITY_LEVELS:
            raise ValueError(f"volatility must be one of {list(VOLATILITY_LEVELS)}")
        unknown = set(self.mix) - set(STRATEGY_NAMES)
        if unknown:
            raise ValueError(f"unknown strategies in mix: {sorted(unknown)}")
        if sum(max(0.0, w) for w in self.mix.values()) <= 0:
            raise ValueError("strategy mix needs at least one positive weight")
        return self

    @property
    def volatility_factor(self) -> float:
        return VOLATILITY_LEVELS[self.volatility]

    def max_qty(self) -> int:
        return max(1, round(self.base_max_qty * self.volatility_factor))

    def copy(self, **changes) -> "SimConfig":
        new = copy.deepcopy(self)
        for k, v in changes.items():
            setattr(new, k, v)
        return new
