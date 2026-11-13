import { STRATEGY_NAMES, type SimConfig, type StrategyName } from "./config";
import { MarketEngine, type EventKey } from "./engine";
import { downsample, marketSummary, mean, stdSample } from "./analysis";

export interface Scenario {
  key: string;
  name: string;
  /** Event and the fraction of the run at which it starts. */
  events: [EventKey, number][];
}

export const SCENARIOS: Scenario[] = [
  { key: "normal", name: "Normal market", events: [] },
  { key: "shock", name: "Market shock at 50%", events: [["shock", 0.5]] },
  { key: "bull", name: "Bull run at 30%", events: [["bull", 0.3]] },
  { key: "negative", name: "Negative news at 40%", events: [["negative", 0.4]] },
  { key: "rollercoaster", name: "Bull run, then shock", events: [["bull", 0.2], ["shock", 0.6]] },
];

export function scheduleFor(sc: Scenario, steps: number): Record<number, EventKey> {
  const s: Record<number, EventKey> = {};
  for (const [k, f] of sc.events) s[Math.max(1, Math.round(f * steps))] = k;
  return s;
}

export interface ScenarioRow {
  strategy: StrategyName;
  meanReturnPct: number;
  stdReturnPct: number;
  worstRunPct: number;
  bestRunPct: number;
  wins: number;
}

export interface ScenarioResult {
  kind: "scenario";
  scenario: string;
  runs: number;
  /** Step numbers of the points in the bands below. */
  x: number[];
  p10: number[];
  p50: number[];
  p90: number[];
  events: { key: EventKey; step: number }[];
  rows: ScenarioRow[];
  insight: string;
}

export interface SweepRow {
  momentumShare: number;
  volatilityPct: number;
  volatilityStd: number;
  maxDrawdownPct: number;
  priceRangePct: number;
}

export interface SweepResult {
  kind: "sweep";
  runs: number;
  rows: SweepRow[];
  insight: string;
}

type Progress = (done: number, total: number) => void;
const pause = () => new Promise<void>((r) => setTimeout(r, 0));
const signed = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1);

/** Repeats one scenario with different seeds and compares the strategies. Yields to the page between runs. */
export async function runScenario(sc: Scenario, runs: number, base: SimConfig, progress: Progress = () => {}, stop: () => boolean = () => false): Promise<ScenarioResult | null> {
  const schedule = scheduleFor(sc, base.steps);
  const seed0 = base.seed ?? 0;
  const per: Partial<Record<StrategyName, number>>[] = [];
  const paths: number[][] = [];
  for (let i = 0; i < runs; i++) {
    if (stop()) break;
    const e = new MarketEngine({ ...base, seed: seed0 + i }, false).run(undefined, schedule);
    const rows = e.traderRows();
    const m: Partial<Record<StrategyName, number>> = {};
    for (const n of STRATEGY_NAMES) {
      const r = rows.filter((x) => x.strategy === n).map((x) => x.returnPct);
      if (r.length) m[n] = mean(r);
    }
    per.push(m);
    paths.push(e.prices.slice());
    progress(i + 1, runs);
    await pause();
  }
  if (!per.length) return null;
  const names = STRATEGY_NAMES.filter((n) => per[0][n] !== undefined);
  const wins = new Map<StrategyName, number>(names.map((n) => [n, 0]));
  for (const m of per) {
    const best = names.reduce((a, b) => ((m[b] as number) > (m[a] as number) ? b : a));
    wins.set(best, (wins.get(best) ?? 0) + 1);
  }
  const rows: ScenarioRow[] = names
    .map((n) => {
      const v = per.map((m) => m[n] as number);
      return { strategy: n, meanReturnPct: mean(v), stdReturnPct: stdSample(v), worstRunPct: Math.min(...v), bestRunPct: Math.max(...v), wins: wins.get(n) ?? 0 };
    })
    .sort((a, b) => b.meanReturnPct - a.meanReturnPct);
  const n = per.length;
  const top = rows[0];
  const steady = rows.reduce((a, b) => (b.stdReturnPct < a.stdReturnPct ? b : a));
  const most = rows.reduce((a, b) => (b.wins > a.wins ? b : a));
  let insight = `${sc.name}: ${top.strategy} had the highest average return (${signed(top.meanReturnPct)}%) and won ${top.wins} of ${n} runs. `;
  if (most.strategy !== top.strategy) insight += `${most.strategy} won more runs (${most.wins}) but with a lower average. `;
  insight += `Most stable: ${steady.strategy} (spread ${steady.stdReturnPct.toFixed(1)} points).`;
  const idx = downsample(paths[0].length, 200);
  const pct = (q: number) =>
    idx.map((j) => {
      const col = paths.map((p) => p[j]).sort((a, b) => a - b);
      const pos = (col.length - 1) * q;
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      return col[lo] + (col[hi] - col[lo]) * (pos - lo);
    });
  return {
    kind: "scenario", scenario: sc.name, runs: n, x: idx, p10: pct(0.1), p50: pct(0.5), p90: pct(0.9),
    events: Object.entries(schedule).map(([s, key]) => ({ key, step: Number(s) })).sort((a, b) => a.step - b.step), rows, insight,
  };
}

/** How the share of Momentum traders changes volatility and drawdown. */
export async function runSweep(runs: number, base: SimConfig, progress: Progress = () => {}, stop: () => boolean = () => false): Promise<SweepResult | null> {
  const shares = [0, 0.25, 0.5, 0.75, 0.9];
  const others = STRATEGY_NAMES.filter((n) => n !== "Momentum");
  const seed0 = base.seed ?? 0;
  const total = shares.length * runs;
  let done = 0;
  const rows: SweepRow[] = [];
  for (const share of shares) {
    const mix = { Random: 0, Momentum: share, "Mean Reversion": 0, "Risk-Averse": 0 } as Record<StrategyName, number>;
    for (const n of others) mix[n] = (1 - share) / others.length;
    const vol: number[] = [];
    const dd: number[] = [];
    const range: number[] = [];
    for (let i = 0; i < runs; i++) {
      if (stop()) break;
      const ms = marketSummary(new MarketEngine({ ...base, mix, seed: seed0 + i }, false).run());
      vol.push(ms.volatilityPct);
      dd.push(ms.maxDrawdownPct);
      range.push(((ms.highest - ms.lowest) / ms.initialPrice) * 100);
      progress(++done, total);
      await pause();
    }
    if (vol.length) rows.push({ momentumShare: share, volatilityPct: mean(vol), volatilityStd: stdSample(vol), maxDrawdownPct: mean(dd), priceRangePct: mean(range) });
  }
  if (rows.length < 2) return null;
  const a = rows[0];
  const b = rows[rows.length - 1];
  const insight = `As Momentum traders went from ${Math.round(a.momentumShare * 100)}% to ${Math.round(b.momentumShare * 100)}% of the market, average step volatility ${b.volatilityPct > a.volatilityPct ? "rose" : "fell"} from ${a.volatilityPct.toFixed(2)}% to ${b.volatilityPct.toFixed(2)}%.`;
  return { kind: "sweep", runs, rows, insight };
}
