"""Data analysis with Pandas and NumPy."""

from __future__ import annotations

import os
from typing import Dict, List

import numpy as np
import pandas as pd

from .market import MarketEngine


def market_summary(engine: MarketEngine) -> Dict[str, float]:
    m = engine.market_df()
    prices = m["price"].to_numpy()
    returns = np.diff(prices) / prices[:-1] if len(prices) > 1 else np.array([0.0])
    running_max = np.maximum.accumulate(prices)
    drawdown = (prices - running_max) / running_max
    return {
        "Steps run": int(engine.step_no),
        "Initial price": float(prices[0]),
        "Final price": float(prices[-1]),
        "Total return %": float((prices[-1] / prices[0] - 1) * 100),
        "Highest price": float(prices.max()),
        "Lowest price": float(prices.min()),
        "Total volume": int(m["volume"].sum()),
        "Volatility % (std of step returns)": float(np.std(returns) * 100),
        "Max drawdown %": float(drawdown.min() * 100),
        "Rejected orders": int(m["rejected"].sum()),
        "Capped steps": int(m["capped"].sum()),
    }


def strategy_summary(engine: MarketEngine) -> pd.DataFrame:
    df = engine.traders_df()
    out = df.groupby("strategy").agg(
        traders=("trader", "count"),
        mean_return_pct=("return_pct", "mean"),
        std_return_pct=("return_pct", "std"),
        best_pct=("return_pct", "max"),
        worst_pct=("return_pct", "min"),
        avg_trades=("trade_count", "mean"),
        rejected=("rejected", "sum"),
    )
    return out.fillna(0.0).sort_values("mean_return_pct", ascending=False)


def portfolio_growth(engine: MarketEngine) -> pd.DataFrame:
    """Wide table: step x strategy -> mean portfolio value."""
    return engine.portfolio_df().pivot(index="step", columns="strategy", values="mean_value")


def rolling_pressure(engine: MarketEngine, window: int = 20) -> pd.DataFrame:
    m = engine.market_df()[["buy_pressure", "sell_pressure"]]
    return m.rolling(window, min_periods=1).mean()


def moving_average(values: np.ndarray, window: int = 20) -> np.ndarray:
    """Trailing moving average (NaN until enough points)."""
    values = np.asarray(values, dtype=float)
    out = np.full(values.shape, np.nan)
    if len(values) >= window:
        c = np.cumsum(np.insert(values, 0, 0.0))
        out[window - 1:] = (c[window:] - c[:-window]) / window
    return out


def strong_pressure_points(engine: MarketEngine, threshold: float = 0.5, spacing: int = 12):
    """Steps where buying (or selling) pressure clearly dominated — the BUY / SELL markers."""
    ratio = np.asarray(engine.history["demand_ratio"])
    buys: List[int] = []
    sells: List[int] = []
    last = -spacing
    for i, r in enumerate(ratio):
        if i - last < spacing:
            continue
        if r > threshold:
            buys.append(i)
            last = i
        elif r < -threshold:
            sells.append(i)
            last = i
    return buys, sells


def export_csv(engine: MarketEngine, folder: str) -> List[str]:
    os.makedirs(folder, exist_ok=True)
    files = {
        "market.csv": engine.market_df(),
        "trades.csv": engine.trades_df(),
        "traders.csv": engine.traders_df(),
        "strategy_summary.csv": strategy_summary(engine),
        "portfolio_growth.csv": portfolio_growth(engine),
    }
    paths = []
    for name, df in files.items():
        p = os.path.join(folder, name)
        df.to_csv(p, index=name in ("market.csv", "strategy_summary.csv", "portfolio_growth.csv"))
        paths.append(p)
    return paths
