import { STRATEGY_NAMES, type StrategyName } from "./config";
import type { MarketEngine } from "./engine";

export const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
export const stdPop = (a: number[]) => {
  if (!a.length) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};
export const stdSample = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};

export interface MarketSummary {
  steps: number;
  initialPrice: number;
  finalPrice: number;
  totalReturnPct: number;
  highest: number;
  lowest: number;
  totalVolume: number;
  /** Standard deviation of step-to-step returns, in percent. */
  volatilityPct: number;
  maxDrawdownPct: number;
  rejectedOrders: number;
  cappedSteps: number;
}

export function marketSummary(e: MarketEngine): MarketSummary {
  const p = e.prices;
  const ret: number[] = [];
  for (let i = 1; i < p.length; i++) ret.push(p[i] / p[i - 1] - 1);
  let peak = -Infinity;
  let dd = 0;
  let hi = -Infinity;
  let lo = Infinity;
  for (const x of p) {
    peak = Math.max(peak, x);
    dd = Math.min(dd, (x - peak) / peak);
    hi = Math.max(hi, x);
    lo = Math.min(lo, x);
  }
  return {
    steps: e.stepNo, initialPrice: p[0], finalPrice: p[p.length - 1], totalReturnPct: (p[p.length - 1] / p[0] - 1) * 100, highest: hi, lowest: lo,
    totalVolume: e.history.reduce((s, r) => s + r.volume, 0), volatilityPct: stdPop(ret) * 100, maxDrawdownPct: dd * 100,
    rejectedOrders: e.history.reduce((s, r) => s + r.rejected, 0), cappedSteps: e.history.filter((r) => r.capped).length,
  };
}

export interface StrategySummary {
  strategy: StrategyName;
  traders: number;
  meanReturnPct: number;
  stdReturnPct: number;
  bestPct: number;
  worstPct: number;
  avgTrades: number;
  rejected: number;
}

export function strategySummary(e: MarketEngine): StrategySummary[] {
  const rows = e.traderRows();
  return STRATEGY_NAMES.filter((n) => rows.some((r) => r.strategy === n))
    .map((n) => {
      const g = rows.filter((r) => r.strategy === n);
      const r = g.map((x) => x.returnPct);
      return { strategy: n, traders: g.length, meanReturnPct: mean(r), stdReturnPct: stdSample(r), bestPct: Math.max(...r), worstPct: Math.min(...r), avgTrades: mean(g.map((x) => x.trades)), rejected: g.reduce((s, x) => s + x.rejected, 0) };
    })
    .sort((a, b) => b.meanReturnPct - a.meanReturnPct);
}

/** Evenly spaced indices (first and last always included) so long runs draw quickly. */
export function downsample(n: number, target: number): number[] {
  if (n <= target) return Array.from({ length: n }, (_, i) => i);
  const out: number[] = [];
  let last = -1;
  for (let k = 0; k < target; k++) {
    const i = Math.round((k * (n - 1)) / (target - 1));
    if (i !== last) out.push(i);
    last = i;
  }
  return out;
}

export function rolling(values: number[], window: number): number[] {
  const out: number[] = [];
  let s = 0;
  for (let i = 0; i < values.length; i++) {
    s += values[i];
    if (i >= window) s -= values[i - window];
    out.push(s / Math.min(i + 1, window));
  }
  return out;
}
