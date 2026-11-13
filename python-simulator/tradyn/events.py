"""Artificial market events.

Events change how traders behave for a while: some traders who would otherwise
hold (or take the other side) are pushed toward BUY or SELL, and a shock also
makes orders larger. The price then moves through the normal formula — events
never set the price directly.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EventType:
    key: str
    name: str
    description: str
    buy_push: float      # probability a non-buying trader switches to BUY
    sell_push: float     # probability a non-selling trader switches to SELL
    size_boost: float    # order-size multiplier while active
    duration: int        # steps


EVENT_TYPES = {
    "positive": EventType("positive", "Positive Market Event", "Increases buying confidence", 0.30, 0.0, 1.0, 10),
    "negative": EventType("negative", "Negative Market Event", "Increases selling pressure", 0.0, 0.30, 1.0, 10),
    "shock": EventType("shock", "Market Shock", "Sudden rise in selling pressure and volatility", 0.0, 0.60, 1.8, 6),
    "bull": EventType("bull", "Bull Run", "Creates increased buying pressure", 0.25, 0.0, 1.0, 40),
}


@dataclass
class ActiveEvent:
    type: EventType
    start_step: int
    remaining: int
