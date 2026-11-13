"""The market engine — runs the ten-stage simulation loop.

Every call to :meth:`MarketEngine.step` performs one simulation step:

  1. Read current market state           6. Calculate net demand
  2. Each trader chooses BUY/SELL/HOLD    7. Update stock price
  3. Generate order quantity             8. Update portfolios
  4. Check available cash / shares       9. Record data
  5. Calculate buying & selling pressure 10. Move to the next step

Price model (deliberately simple — aggregate pressure, no order book):

  Net Demand   = Buy Pressure - Sell Pressure
  Demand Ratio = (Buy - Sell) / (Buy + Sell + 1)      # always in (-1, +1)
  New Price    = Old Price x (1 + Sensitivity x Demand Ratio)

Guardrails: the price never drops below ``min_price``, the per-step move can
be capped with ``max_move``, and unaffordable orders are rejected.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

from .config import STRATEGY_NAMES, SimConfig
from .events import EVENT_TYPES, ActiveEvent
from .strategies import ACTION_NAMES, BUY, HOLD, SELL, MarketView, make_strategy
from .traders import Trader

HISTORY_KEYS = ("step", "price", "buy_pressure", "sell_pressure", "net_demand", "demand_ratio",
                "volume", "n_buy", "n_sell", "n_hold", "rejected", "capped", "sentiment", "events")


def demand_ratio(buy_pressure: float, sell_pressure: float) -> float:
    """(Buy - Sell) / (Buy + Sell + 1). The +1 avoids division by zero when nobody trades."""
    return (buy_pressure - sell_pressure) / (buy_pressure + sell_pressure + 1.0)


def next_price(price: float, ratio: float, sensitivity: float,
               max_move: Optional[float] = None, min_price: float = 0.01):
    """New Price = Old Price x (1 + Sensitivity x Demand Ratio), with guardrails.

    Returns (new_price, capped).
    """
    change = sensitivity * ratio
    capped = False
    if max_move is not None and abs(change) > max_move:
        change = max_move if change > 0 else -max_move
        capped = True
    return max(min_price, price * (1.0 + change)), capped


@dataclass
class StepResult:
    step: int
    price: float
    prev_price: float
    buy_pressure: int
    sell_pressure: int
    net_demand: int
    demand_ratio: float
    volume: int
    n_buy: int
    n_sell: int
    n_hold: int
    rejected: int
    capped: bool
    sentiment: str
    events: List[str] = field(default_factory=list)


class MarketEngine:
    def __init__(self, config: Optional[SimConfig] = None, record_trades: bool = True):
        self.cfg = (config or SimConfig()).validate()
        self.rng = np.random.default_rng(self.cfg.seed)
        self.record_trades = record_trades
        self.traders: List[Trader] = self._create_traders()
        self.price = float(self.cfg.initial_price)
        self.step_no = 0
        self.active_events: List[ActiveEvent] = []
        self.event_log: List[dict] = []
        self._ratio_ema = 0.0
        self.sentiment = "NEUTRAL"
        # runtime data, turned into Pandas DataFrames on demand
        self.history: Dict[str, list] = {k: [] for k in HISTORY_KEYS}
        self._trade_rows: List[tuple] = []
        self._portfolio_rows: List[tuple] = []
        self._record(StepResult(0, self.price, self.price, 0, 0, 0, 0.0, 0, 0, 0, len(self.traders), 0,
                                False, self.sentiment, []))
        self._record_portfolios()

    # ------------------------------------------------------------------ setup
    def _create_traders(self) -> List[Trader]:
        cfg = self.cfg
        weights = np.array([max(0.0, cfg.mix.get(n, 0.0)) for n in STRATEGY_NAMES])
        exact = weights / weights.sum() * cfg.n_traders
        counts = np.floor(exact).astype(int)
        for i in np.argsort(-(exact - counts))[: cfg.n_traders - counts.sum()]:   # largest remainder
            counts[i] += 1
        names = [n for n, c in zip(STRATEGY_NAMES, counts) for _ in range(c)]
        self.rng.shuffle(names)
        start_value = cfg.initial_cash + cfg.initial_shares * cfg.initial_price
        return [Trader(i + 1, make_strategy(n), cfg.initial_cash, cfg.initial_shares, start_value)
                for i, n in enumerate(names)]

    # ------------------------------------------------------------------ events
    def trigger_event(self, key: str) -> None:
        et = EVENT_TYPES[key]
        self.active_events.append(ActiveEvent(et, self.step_no + 1, et.duration))
        self.event_log.append({"step": self.step_no + 1, "event": et.name, "key": key, "duration": et.duration})

    # ------------------------------------------------------------------ state
    @property
    def finished(self) -> bool:
        return self.step_no >= self.cfg.steps

    def prices(self) -> np.ndarray:
        return np.asarray(self.history["price"], dtype=float)

    # ------------------------------------------------------------------ the loop
    def step(self) -> StepResult:
        cfg, rng = self.cfg, self.rng
        old_price = self.price

        # 1 · read current market state
        view = MarketView(self.step_no + 1, old_price, self.prices())
        buy_push = min(0.9, sum(e.type.buy_push for e in self.active_events))
        sell_push = min(0.9, sum(e.type.sell_push for e in self.active_events))
        size_boost = max([e.type.size_boost for e in self.active_events], default=1.0)
        max_qty = cfg.max_qty()

        buy_p = sell_p = rejected = 0
        counts = {BUY: 0, SELL: 0, HOLD: 0}
        for t in self.traders:
            # 2 · each trader chooses BUY / SELL / HOLD
            action = t.strategy.decide(view, rng)
            if buy_push and action != BUY and rng.random() < buy_push:
                action = BUY
            elif sell_push and action != SELL and rng.random() < sell_push:
                action = SELL
            if action == HOLD:
                counts[HOLD] += 1
                t.last_action = HOLD
                continue
            # 3 · generate order quantity
            qty = max(1, int(round(t.strategy.quantity(rng, max_qty) * size_boost)))
            # 4 · check available cash / shares
            if not t.can_execute(action, qty, old_price):
                rejected += 1
                t.rejected += 1
                t.last_action = HOLD
                counts[HOLD] += 1
                if self.record_trades:
                    self._trade_rows.append((view.step, t.code, t.strategy.name, ACTION_NAMES[action], qty,
                                             round(old_price, 4), "REJECTED"))
                continue
            t.execute(action, qty, old_price)
            counts[action] += 1
            # 5 · accumulate buying & selling pressure
            if action == BUY:
                buy_p += qty
            else:
                sell_p += qty
            if self.record_trades:
                self._trade_rows.append((view.step, t.code, t.strategy.name, ACTION_NAMES[action], qty,
                                         round(old_price, 4), "FILLED"))

        # 6 · net demand
        net = buy_p - sell_p
        ratio = demand_ratio(buy_p, sell_p)
        # 7 · update stock price
        self.price, capped = next_price(old_price, ratio, cfg.sensitivity, cfg.max_move, cfg.min_price)

        self._ratio_ema = 0.8 * self._ratio_ema + 0.2 * ratio
        self.sentiment = "BULLISH" if self._ratio_ema > 0.08 else "BEARISH" if self._ratio_ema < -0.08 else "NEUTRAL"

        names = [e.type.name for e in self.active_events]
        result = StepResult(view.step, self.price, old_price, buy_p, sell_p, net, ratio, buy_p + sell_p,
                            counts[BUY], counts[SELL], counts[HOLD], rejected, capped, self.sentiment, names)
        # 8 · update portfolios (values are cash + shares x the new price) and 9 · record data
        self._record(result)
        self._record_portfolios()

        # 10 · move to the next step
        self.step_no += 1
        for e in self.active_events:
            e.remaining -= 1
        self.active_events = [e for e in self.active_events if e.remaining > 0]
        return result

    def run(self, steps: Optional[int] = None, schedule: Optional[Dict[int, str]] = None) -> "MarketEngine":
        """Run headless. ``schedule`` maps step number -> event key."""
        target = self.cfg.steps if steps is None else min(self.cfg.steps, self.step_no + steps)
        while self.step_no < target:
            if schedule and (self.step_no + 1) in schedule:
                self.trigger_event(schedule[self.step_no + 1])
            self.step()
        return self

    # ------------------------------------------------------------------ recording
    def _record(self, r: StepResult) -> None:
        h = self.history
        for k in HISTORY_KEYS:
            v = getattr(r, k)
            h[k].append(", ".join(v) if k == "events" else v)

    def _record_portfolios(self) -> None:
        by: Dict[str, List[float]] = {}
        for t in self.traders:
            by.setdefault(t.strategy.name, []).append(t.portfolio_value(self.price))
        step = self.history["step"][-1]
        for name, vals in by.items():
            self._portfolio_rows.append((step, name, float(np.mean(vals))))

    # ------------------------------------------------------------------ Pandas views
    def market_df(self) -> pd.DataFrame:
        """One row per step: price, volume, buy/sell pressure, demand ratio, sentiment, events."""
        return pd.DataFrame(self.history).set_index("step")

    def trades_df(self) -> pd.DataFrame:
        return pd.DataFrame(self._trade_rows, columns=["step", "trader", "strategy", "action", "qty", "price", "status"])

    def portfolio_df(self) -> pd.DataFrame:
        """Mean portfolio value per strategy at every step (long format)."""
        return pd.DataFrame(self._portfolio_rows, columns=["step", "strategy", "mean_value"])

    def traders_df(self) -> pd.DataFrame:
        p = self.price
        rows = [{
            "trader": t.code, "strategy": t.strategy.name, "cash": t.cash, "shares": t.shares,
            "portfolio_value": t.portfolio_value(p), "profit_loss": t.profit_loss(p),
            "return_pct": t.return_pct(p), "trade_count": t.trade_count, "rejected": t.rejected,
            "last_action": ACTION_NAMES[t.last_action],
        } for t in self.traders]
        return pd.DataFrame(rows)
