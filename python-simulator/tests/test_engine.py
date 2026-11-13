"""Unit tests for the price model, guardrails, strategies and data layer.

Run:  python -m unittest discover -s tests -v
"""

import os
import sys
import tempfile
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tradyn.analysis import export_csv, market_summary, strategy_summary  # noqa: E402
from tradyn.config import STRATEGY_NAMES, SimConfig  # noqa: E402
from tradyn.experiments import run_composition_sweep, run_scenario  # noqa: E402
from tradyn.market import MarketEngine, demand_ratio, next_price  # noqa: E402
from tradyn.strategies import BUY, HOLD, SELL, MarketView, make_strategy  # noqa: E402
from tradyn.traders import Trader  # noqa: E402


class PriceModel(unittest.TestCase):
    def test_demand_ratio_matches_formula(self):
        self.assertAlmostEqual(demand_ratio(55, 30), 25 / 86)
        self.assertEqual(demand_ratio(0, 0), 0.0)          # +1 avoids division by zero

    def test_demand_ratio_bounded(self):
        for b, s in ((10_000, 0), (0, 10_000), (3, 7)):
            self.assertTrue(-1 < demand_ratio(b, s) < 1)

    def test_worked_example_from_slides(self):
        price, _ = next_price(123.81, demand_ratio(55, 30), 0.02)
        self.assertAlmostEqual(price, 124.53, places=2)

    def test_cap_and_positive_price(self):
        p, capped = next_price(100, 1.0, 0.5, max_move=0.05)
        self.assertTrue(capped)
        self.assertAlmostEqual(p, 105.0)
        p, _ = next_price(0.02, -1.0, 0.5, max_move=None, min_price=0.01)
        self.assertGreaterEqual(p, 0.01)


class TradersAndStrategies(unittest.TestCase):
    def test_orders_need_cash_or_shares(self):
        t = Trader(1, make_strategy("Random"), cash=50.0, shares=0, initial_value=50.0)
        self.assertFalse(t.can_execute(BUY, 1, 100.0))
        self.assertFalse(t.can_execute(SELL, 1, 100.0))
        self.assertTrue(t.can_execute(HOLD, 1, 100.0))

    def test_portfolio_value(self):
        t = Trader(1, make_strategy("Momentum"), cash=8420.0, shares=12, initial_value=10_000.0)
        self.assertAlmostEqual(t.portfolio_value(124.53), 9914.36, places=2)
        self.assertAlmostEqual(t.profit_loss(124.53), -85.64, places=2)

    def test_momentum_and_mean_reversion_rules(self):
        rng = np.random.default_rng(0)
        rising = MarketView(10, 110.0, np.linspace(100, 110, 10))
        self.assertEqual(make_strategy("Momentum").decide(rising, rng), BUY)
        self.assertEqual(make_strategy("Mean Reversion").decide(rising, rng), SELL)
        falling = MarketView(10, 90.0, np.linspace(100, 90, 10))
        self.assertEqual(make_strategy("Momentum").decide(falling, rng), SELL)
        self.assertEqual(make_strategy("Mean Reversion").decide(falling, rng), BUY)

    def test_risk_averse_ignores_small_moves(self):
        rng = np.random.default_rng(0)
        flat = MarketView(10, 100.1, np.linspace(100, 100.1, 10))
        self.assertTrue(all(make_strategy("Risk-Averse").decide(flat, rng) == HOLD for _ in range(50)))


class Engine(unittest.TestCase):
    def test_same_seed_same_run(self):
        a = MarketEngine(SimConfig(seed=7, steps=150)).run().prices()
        b = MarketEngine(SimConfig(seed=7, steps=150)).run().prices()
        np.testing.assert_allclose(a, b)

    def test_strategy_mix_counts(self):
        e = MarketEngine(SimConfig(n_traders=10, mix={"Random": 1, "Momentum": 1, "Mean Reversion": 0, "Risk-Averse": 0}))
        names = [t.strategy.name for t in e.traders]
        self.assertEqual(names.count("Random"), 5)
        self.assertEqual(names.count("Momentum"), 5)

    def test_run_records_every_step(self):
        e = MarketEngine(SimConfig(steps=200)).run()
        m = e.market_df()
        self.assertEqual(len(m), 201)                     # step 0 + 200 steps
        self.assertTrue((m["price"] > 0).all())
        self.assertTrue(np.allclose(m["volume"], m["buy_pressure"] + m["sell_pressure"]))
        self.assertTrue(np.allclose(m["net_demand"], m["buy_pressure"] - m["sell_pressure"]))

    def test_price_follows_formula_each_step(self):
        cfg = SimConfig(steps=120, seed=3)
        e = MarketEngine(cfg).run()
        m = e.market_df()
        for i in range(1, len(m)):
            exp, _ = next_price(m.price.iloc[i - 1], m.demand_ratio.iloc[i], cfg.sensitivity, cfg.max_move, cfg.min_price)
            self.assertAlmostEqual(m.price.iloc[i], exp, places=9)

    def test_no_negative_cash_or_shares(self):
        e = MarketEngine(SimConfig(steps=300, volatility="High")).run(schedule={50: "shock", 150: "bull"})
        for t in e.traders:
            self.assertGreaterEqual(t.cash, -1e-9)
            self.assertGreaterEqual(t.shares, 0)

    def test_shock_raises_selling_pressure(self):
        cfg = SimConfig(steps=60, seed=11)
        calm = MarketEngine(cfg).run().market_df().loc[31:36, "sell_pressure"].mean()
        shocked = MarketEngine(cfg).run(schedule={31: "shock"}).market_df().loc[31:36, "sell_pressure"].mean()
        self.assertGreater(shocked, calm)

    def test_dataframes_and_summaries(self):
        e = MarketEngine(SimConfig(steps=100)).run()
        self.assertGreater(len(e.trades_df()), 0)
        self.assertEqual(set(strategy_summary(e).index), set(STRATEGY_NAMES))
        ms = market_summary(e)
        self.assertAlmostEqual(ms["Final price"], e.price)
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(len(export_csv(e, d)), 5)


class Experiments(unittest.TestCase):
    def test_scenario(self):
        r = run_scenario("shock", runs=3, base=SimConfig(steps=100))
        self.assertEqual(r.paths.shape, (3, 101))
        self.assertEqual(r.summary()["wins"].sum(), 3)
        self.assertIn("Market shock", r.insight())

    def test_sweep(self):
        r = run_composition_sweep(shares=(0.0, 0.5), runs=2, base=SimConfig(steps=100))
        self.assertEqual(len(r.table), 4)


if __name__ == "__main__":
    unittest.main()
