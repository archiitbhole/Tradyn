"""Experiment Lab — repeatable simulation experiments.

Two kinds of experiment:

* Scenario comparison — run the same scenario many times (different random
  seeds) and compare how each strategy performed. Answers questions such as
  "Which strategy performs best after a market shock?" and "Which is most stable?"
* Trader-composition sweep — change the share of Momentum ("aggressive",
  trend-following) traders and measure price volatility. Answers "How does
  trader composition affect price volatility?"

Results describe this artificial market only; they are not predictions of
real financial markets.

CLI:  python -m tradyn.experiments --scenario shock --runs 30
      python -m tradyn.experiments --sweep --runs 10
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from .analysis import market_summary
from .config import STRATEGY_NAMES, SimConfig
from .market import MarketEngine


@dataclass(frozen=True)
class Scenario:
    key: str
    name: str
    events: Tuple[Tuple[str, float], ...]   # (event key, position as a fraction of the run)


SCENARIOS: Dict[str, Scenario] = {
    "normal": Scenario("normal", "Normal market", ()),
    "shock": Scenario("shock", "Market shock at 50%", (("shock", 0.5),)),
    "bull": Scenario("bull", "Bull run at 30%", (("bull", 0.3),)),
    "negative": Scenario("negative", "Negative event at 40%", (("negative", 0.4),)),
    "rollercoaster": Scenario("rollercoaster", "Bull run then shock", (("bull", 0.2), ("shock", 0.6))),
}

Progress = Optional[Callable[[int, int], None]]
Stop = Optional[Callable[[], bool]]


@dataclass
class ScenarioResult:
    scenario: Scenario
    runs: pd.DataFrame          # one row per (run, strategy): mean_return_pct
    markets: pd.DataFrame       # one row per run: market summary
    paths: np.ndarray           # runs x (steps+1) price paths
    event_steps: List[Tuple[str, int]]

    def summary(self) -> pd.DataFrame:
        g = self.runs.groupby("strategy")["mean_return_pct"]
        wide = self.runs.pivot(index="run", columns="strategy", values="mean_return_pct")
        winners = wide.idxmax(axis=1).value_counts()
        out = pd.DataFrame({
            "mean_return_pct": g.mean(),
            "std_return_pct": g.std().fillna(0.0),
            "worst_run_pct": g.min(),
            "best_run_pct": g.max(),
            "wins": winners.reindex(g.mean().index).fillna(0).astype(int),
        })
        return out.sort_values("mean_return_pct", ascending=False)

    def insight(self) -> str:
        s = self.summary()
        top = s.index[0]
        steady = s["std_return_pct"].idxmin()
        n = self.runs["run"].nunique()
        text = (f"{self.scenario.name}: {top} had the highest average return "
                f"({s.loc[top, 'mean_return_pct']:+.1f}%) and won {s.loc[top, 'wins']} of {n} runs. ")
        most_wins = s["wins"].idxmax()
        if most_wins != top:
            text += f"{most_wins} won more runs ({s.loc[most_wins, 'wins']}) but with a lower average. "
        return text + f"Most stable: {steady} (spread {s.loc[steady, 'std_return_pct']:.1f} pts)."


def _schedule(scenario: Scenario, steps: int) -> Dict[int, str]:
    return {max(1, int(round(frac * steps))): key for key, frac in scenario.events}


def run_scenario(scenario_key: str, runs: int = 20, base: Optional[SimConfig] = None,
                 progress: Progress = None, stop: Stop = None) -> ScenarioResult:
    base = (base or SimConfig()).validate()
    scenario = SCENARIOS[scenario_key]
    schedule = _schedule(scenario, base.steps)
    seed0 = base.seed if base.seed is not None else 0
    rows, markets, paths = [], [], []
    for i in range(runs):
        if stop and stop():
            break
        eng = MarketEngine(base.copy(seed=seed0 + i), record_trades=False).run(schedule=schedule)
        tdf = eng.traders_df()
        for name, val in tdf.groupby("strategy")["return_pct"].mean().items():
            rows.append({"run": i, "strategy": name, "mean_return_pct": float(val)})
        ms = market_summary(eng)
        ms["run"] = i
        markets.append(ms)
        paths.append(eng.prices())
        if progress:
            progress(i + 1, runs)
    return ScenarioResult(scenario, pd.DataFrame(rows), pd.DataFrame(markets),
                          np.vstack(paths) if paths else np.empty((0, base.steps + 1)),
                          sorted(((k, s) for s, k in schedule.items()), key=lambda x: x[1]))


@dataclass
class SweepResult:
    table: pd.DataFrame   # one row per (momentum share, run)

    def summary(self) -> pd.DataFrame:
        g = self.table.groupby("momentum_share")
        return pd.DataFrame({
            "volatility_pct": g["volatility_pct"].mean(),
            "volatility_std": g["volatility_pct"].std().fillna(0.0),
            "max_drawdown_pct": g["max_drawdown_pct"].mean(),
            "price_range_pct": g["price_range_pct"].mean(),
        })

    def insight(self) -> str:
        s = self.summary()
        lo, hi = s.index.min(), s.index.max()
        a, b = s.loc[lo, "volatility_pct"], s.loc[hi, "volatility_pct"]
        trend = "rose" if b > a else "fell"
        return (f"As Momentum traders went from {lo:.0%} to {hi:.0%} of the market, "
                f"average step volatility {trend} from {a:.2f}% to {b:.2f}%.")


def run_composition_sweep(shares=(0.0, 0.25, 0.5, 0.75, 0.9), runs: int = 10, base: Optional[SimConfig] = None,
                          progress: Progress = None, stop: Stop = None) -> SweepResult:
    """Vary the share of Momentum traders; the rest are split equally among the other strategies."""
    base = (base or SimConfig()).validate()
    others = [n for n in STRATEGY_NAMES if n != "Momentum"]
    seed0 = base.seed if base.seed is not None else 0
    rows, total, done = [], len(shares) * runs, 0
    for share in shares:
        mix = {"Momentum": share, **{n: (1 - share) / len(others) for n in others}}
        if share == 0:
            mix["Momentum"] = 0.0
        for i in range(runs):
            if stop and stop():
                return SweepResult(pd.DataFrame(rows))
            eng = MarketEngine(base.copy(mix=mix, seed=seed0 + i), record_trades=False).run()
            ms = market_summary(eng)
            rows.append({"momentum_share": share, "run": i,
                         "volatility_pct": ms["Volatility % (std of step returns)"],
                         "max_drawdown_pct": ms["Max drawdown %"],
                         "price_range_pct": (ms["Highest price"] - ms["Lowest price"]) / ms["Initial price"] * 100})
            done += 1
            if progress:
                progress(done, total)
    return SweepResult(pd.DataFrame(rows))


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description="Run simulation experiments from the command line.")
    ap.add_argument("--scenario", choices=sorted(SCENARIOS), default="shock")
    ap.add_argument("--runs", type=int, default=20)
    ap.add_argument("--steps", type=int, default=500)
    ap.add_argument("--traders", type=int, default=40)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--sweep", action="store_true", help="run the trader-composition sweep instead")
    a = ap.parse_args(argv)
    base = SimConfig(steps=a.steps, n_traders=a.traders, seed=a.seed)
    pd.set_option("display.width", 120)
    if a.sweep:
        res = run_composition_sweep(runs=a.runs, base=base)
        print(res.summary().round(3))
        print("\n" + res.insight())
    else:
        res = run_scenario(a.scenario, runs=a.runs, base=base)
        print(res.summary().round(2))
        print("\n" + res.insight())
    print("\nSimulation experiment only — describes this artificial market, not real markets.")


if __name__ == "__main__":
    main()
