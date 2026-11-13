import type { Breadth, Candle, Quote, SectorPerformance } from "@/types/market";

/** Pure calculations for the Market Insights page. Every function works only on data that was retrieved. */

export function sma(values: number[], n: number): number | null {
  if (values.length < n) return null;
  let s = 0;
  for (let i = values.length - n; i < values.length; i++) s += values[i];
  return s / n;
}

/** Annualised standard deviation of daily log returns over the last `n` sessions, in percent. */
export function realizedVolatility(closes: number[], n: number): number | null {
  if (closes.length < n + 1) return null;
  const r: number[] = [];
  for (let i = closes.length - n; i < closes.length; i++) r.push(Math.log(closes[i] / closes[i - 1]));
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const variance = r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

/** Percent change over the last `sessions` daily candles. */
export function periodReturn(closes: number[], sessions: number): number | null {
  if (closes.length <= sessions) return null;
  const from = closes[closes.length - 1 - sessions];
  return from > 0 ? (closes[closes.length - 1] / from - 1) * 100 : null;
}

export interface TrendStats {
  last: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ret1m: number | null;
  ret3m: number | null;
  ret1y: number | null;
  high: number;
  low: number;
  /** Distance of the last close below the period high, in percent (0 = at the high). */
  offHighPct: number;
  vol20: number | null;
  vol60: number | null;
  sessions: number;
}

export function trendStats(candles: Candle[]): TrendStats | null {
  const closes = candles.map((c) => c.close);
  if (closes.length < 2) return null;
  const last = closes[closes.length - 1];
  const high = Math.max(...candles.map((c) => c.high));
  const low = Math.min(...candles.map((c) => c.low));
  return {
    last, sma20: sma(closes, 20), sma50: sma(closes, 50), sma200: sma(closes, 200),
    ret1m: periodReturn(closes, 21), ret3m: periodReturn(closes, 63), ret1y: closes.length >= 200 ? (last / closes[0] - 1) * 100 : null,
    high, low, offHighPct: ((high - last) / high) * 100, vol20: realizedVolatility(closes, 20), vol60: realizedVolatility(closes, 60), sessions: closes.length,
  };
}

export interface RangeStat {
  quote: Quote;
  /** (day high − day low) ÷ previous close, in percent. */
  rangePct: number;
}

export function dayRanges(quotes: Quote[]): { average: number | null; widest: RangeStat[]; counted: number } {
  const rows: RangeStat[] = [];
  for (const q of quotes) {
    if (q.high != null && q.low != null && q.prevClose != null && q.prevClose > 0 && q.high >= q.low) rows.push({ quote: q, rangePct: ((q.high - q.low) / q.prevClose) * 100 });
  }
  rows.sort((a, b) => b.rangePct - a.rangePct);
  return { average: rows.length ? rows.reduce((s, r) => s + r.rangePct, 0) / rows.length : null, widest: rows.slice(0, 6), counted: rows.length };
}

export interface RelativeStat {
  quote: Quote;
  /** Share's day change minus the benchmark's day change, in percentage points. */
  relative: number;
}

export function relativePerformance(quotes: Quote[], benchmarkPct: number | null): { leaders: RelativeStat[]; laggards: RelativeStat[] } {
  if (benchmarkPct == null) return { leaders: [], laggards: [] };
  const rows = quotes.filter((q) => q.changePct != null).map((q) => ({ quote: q, relative: (q.changePct as number) - benchmarkPct })).sort((a, b) => b.relative - a.relative);
  return { leaders: rows.filter((r) => r.relative > 0).slice(0, 6), laggards: rows.filter((r) => r.relative < 0).reverse().slice(0, 6) };
}

export interface VolumeStats {
  total: number;
  counted: number;
  /** Share of all counted volume traded in the ten busiest shares, in percent. */
  top10SharePct: number | null;
  upVolumePct: number | null;
  top: Quote[];
}

export function volumeStats(quotes: Quote[]): VolumeStats {
  const rows = quotes.filter((q) => q.volume != null && q.volume > 0).sort((a, b) => (b.volume as number) - (a.volume as number));
  const total = rows.reduce((s, q) => s + (q.volume as number), 0);
  const withDir = rows.filter((q) => q.changePct != null);
  const dirTotal = withDir.reduce((s, q) => s + (q.volume as number), 0);
  const up = withDir.filter((q) => (q.changePct as number) > 0).reduce((s, q) => s + (q.volume as number), 0);
  return {
    total, counted: rows.length, top: rows.slice(0, 8),
    top10SharePct: rows.length >= 10 && total > 0 ? (rows.slice(0, 10).reduce((s, q) => s + (q.volume as number), 0) / total) * 100 : null,
    upVolumePct: dirTotal > 0 ? (up / dirTotal) * 100 : null,
  };
}

export interface Reading {
  topic: string;
  text: string;
}

const f1 = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1) + "%";

/**
 * Plain-language readings produced by fixed rules from the figures on the page. They restate what the
 * data shows today; they are not forecasts and not advice.
 */
export function readings(input: { breadth?: Breadth; sectors?: SectorPerformance[]; trend?: TrendStats | null; ranges?: { average: number | null }; volume?: VolumeStats; vix?: number | null; universeLabel?: string; open?: boolean }): Reading[] {
  const out: Reading[] = [];
  const when = input.open ? "so far today" : "in the last session";
  const b = input.breadth;
  if (b && b.advances + b.declines > 0) {
    const ratio = b.advances / Math.max(1, b.declines);
    const tone = ratio >= 2 ? "Buying was broad" : ratio >= 1.2 ? "More shares rose than fell" : ratio > 0.83 ? "The market was evenly split" : ratio > 0.5 ? "More shares fell than rose" : "Selling was broad";
    out.push({ topic: "Breadth", text: `${tone} ${when}: ${b.advances} advanced and ${b.declines} declined among the ${b.priced} shares priced${input.universeLabel ? ` in the ${input.universeLabel}` : ""}.` });
  }
  const s = input.sectors;
  if (s && s.length >= 2) {
    const best = s[0];
    const worst = s[s.length - 1];
    const upCount = s.filter((x) => x.changePct > 0).length;
    out.push({ topic: "Sectors", text: `${upCount} of ${s.length} sectors were higher. ${best.sector} led (${f1(best.changePct)}) and ${worst.sector} lagged (${f1(worst.changePct)}).` });
  }
  const t = input.trend;
  if (t) {
    const parts: string[] = [];
    if (t.sma20 != null && t.sma50 != null) {
      const a20 = t.last >= t.sma20;
      const a50 = t.last >= t.sma50;
      parts.push(a20 && a50 ? "The Nifty 50 closed above both its 20-day and 50-day averages" : !a20 && !a50 ? "The Nifty 50 closed below both its 20-day and 50-day averages" : `The Nifty 50 closed ${a20 ? "above" : "below"} its 20-day average and ${a50 ? "above" : "below"} its 50-day average`);
    }
    if (t.ret1m != null) parts.push(`it is ${f1(t.ret1m)} over the last month of trading`);
    if (parts.length) out.push({ topic: "Trend", text: parts.join(", and ") + `. It is ${t.offHighPct.toFixed(1)}% below the highest level in the ${t.sessions} sessions retrieved.` });
    if (t.vol20 != null && t.vol60 != null) {
      out.push({ topic: "Volatility", text: `Nifty 50 daily swings over the last 20 sessions work out to ${t.vol20.toFixed(1)}% a year, ${t.vol20 > t.vol60 * 1.15 ? "higher than" : t.vol20 < t.vol60 * 0.85 ? "lower than" : "about the same as"} the 60-session figure (${t.vol60.toFixed(1)}%).${input.vix != null ? ` India VIX, the market's own estimate of coming volatility, is ${input.vix.toFixed(2)}.` : ""}` });
    }
  }
  const v = input.volume;
  if (v && v.upVolumePct != null && v.counted >= 10) {
    out.push({ topic: "Volume", text: `${v.upVolumePct.toFixed(0)}% of the shares traded were in rising shares${v.top10SharePct != null ? `, and the ten busiest shares made up ${v.top10SharePct.toFixed(0)}% of all volume counted` : ""}.` });
  }
  return out;
}
