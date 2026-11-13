/**
 * Tradyn Simulator — an ARTIFICIAL market. Nothing in this folder reads, stores or produces real
 * stock prices, and nothing outside src/lib/simulator and src/components/simulator imports it.
 */
export const STRATEGY_NAMES = ["Random", "Momentum", "Mean Reversion", "Risk-Averse"] as const;
export type StrategyName = (typeof STRATEGY_NAMES)[number];

export const VOLATILITY = { Low: 0.6, Medium: 1.0, High: 1.8 } as const;
export type VolatilityLevel = keyof typeof VOLATILITY;

export interface SimConfig {
  traders: number;
  initialPrice: number;
  steps: number;
  /** How strongly net demand moves the price each step. */
  sensitivity: number;
  /** Largest price move allowed in one step (0.05 = 5%). */
  maxMove: number;
  minPrice: number;
  volatility: VolatilityLevel;
  initialCash: number;
  initialShares: number;
  baseMaxQty: number;
  /** Relative weight of each strategy among the traders. */
  mix: Record<StrategyName, number>;
  seed: number | null;
}

export function defaultConfig(): SimConfig {
  return {
    traders: 40, initialPrice: 100, steps: 500, sensitivity: 0.02, maxMove: 0.05, minPrice: 0.01, volatility: "Medium",
    initialCash: 5000, initialShares: 50, baseMaxQty: 10, mix: { Random: 1, Momentum: 1, "Mean Reversion": 1, "Risk-Averse": 1 }, seed: 42,
  };
}

export const PRESETS: { key: string; name: string; description: string; patch: Partial<SimConfig> }[] = [
  { key: "balanced", name: "Balanced", description: "Equal numbers of all four strategies.", patch: {} },
  { key: "herd", name: "Trend chasers", description: "Mostly Momentum traders — moves feed on themselves.", patch: { mix: { Random: 1, Momentum: 6, "Mean Reversion": 1, "Risk-Averse": 1 } } },
  { key: "calm", name: "Calm market", description: "Low volatility, many Risk-Averse and Mean Reversion traders.", patch: { volatility: "Low", mix: { Random: 1, Momentum: 1, "Mean Reversion": 3, "Risk-Averse": 3 } } },
  { key: "wild", name: "Wild market", description: "High volatility and a more sensitive price.", patch: { volatility: "High", sensitivity: 0.035 } },
];

export function validateConfig(c: SimConfig): string | null {
  if (!(c.traders >= 2 && c.traders <= 400)) return "Traders must be between 2 and 400.";
  if (!(c.initialPrice > 0 && c.initialPrice <= 1_000_000)) return "Start price must be between 0 and 10,00,000.";
  if (!(c.steps >= 10 && c.steps <= 5000)) return "Steps must be between 10 and 5000.";
  if (!(c.sensitivity > 0 && c.sensitivity <= 0.5)) return "Sensitivity must be between 0 and 0.5.";
  if (!(c.maxMove > 0 && c.maxMove <= 0.5)) return "Largest step move must be between 0 and 50%.";
  if (!(c.volatility in VOLATILITY)) return "Volatility must be Low, Medium or High.";
  if (STRATEGY_NAMES.reduce((s, n) => s + Math.max(0, c.mix[n] || 0), 0) <= 0) return "Give at least one strategy some weight.";
  return null;
}

export const maxQty = (c: SimConfig) => Math.max(1, Math.round(c.baseMaxQty * VOLATILITY[c.volatility]));
