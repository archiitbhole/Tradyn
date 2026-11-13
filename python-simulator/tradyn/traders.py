"""A simulated trader: its own cash, shares and strategy."""

from __future__ import annotations

from dataclasses import dataclass

from .strategies import BUY, HOLD, SELL, Strategy


@dataclass
class Trader:
    trader_id: int
    strategy: Strategy
    cash: float
    shares: int
    initial_value: float
    trade_count: int = 0
    rejected: int = 0
    last_action: int = HOLD

    @property
    def code(self) -> str:
        return f"T{self.trader_id:02d}"

    def portfolio_value(self, price: float) -> float:
        """Portfolio value = cash + shares x price."""
        return self.cash + self.shares * price

    def profit_loss(self, price: float) -> float:
        return self.portfolio_value(price) - self.initial_value

    def return_pct(self, price: float) -> float:
        return 100.0 * self.profit_loss(price) / self.initial_value

    def can_execute(self, action: int, qty: int, price: float) -> bool:
        """Stage 4 — orders need enough cash (BUY) or shares (SELL)."""
        if action == BUY:
            return self.cash >= qty * price
        if action == SELL:
            return self.shares >= qty
        return True

    def execute(self, action: int, qty: int, price: float) -> None:
        if action == BUY:
            self.cash -= qty * price
            self.shares += qty
        elif action == SELL:
            self.cash += qty * price
            self.shares -= qty
        self.trade_count += 1
        self.last_action = action
