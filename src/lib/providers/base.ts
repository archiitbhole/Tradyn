import "server-only";
import type { Candle, Exchange, History, HistoryRange, Instrument, MarketStatus, Movers, ProviderId, Quote, SectorPerformance } from "@/types/market";
import { cacheGet, cacheSet, cached } from "@/lib/market-data/cache";
import { freshnessOf, marketStatus } from "@/lib/market-data/session";
import { istDate, istDayStartSec } from "@/lib/market-data/time";
import { indexInstruments, searchLocal, trackedInstruments, universeInfo } from "@/lib/market-data/universe";
import { ProviderError } from "./errors";
import type { MarketDataProvider, QuoteBatch } from "./types";

export interface QuoteFields {
  price: number;
  prevClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  ts: number | null;
}

const positive = (v: number | null) => (v != null && v > 0 ? v : null);

/** Shared behaviour: caching, single-quote lookup, search over the instrument list, status and rankings. */
export abstract class BaseProvider implements MarketDataProvider {
  abstract readonly id: ProviderId;
  abstract readonly name: string;
  abstract readonly official: boolean;
  abstract readonly delayed: boolean;
  abstract readonly note: string;
  abstract readonly moversLimit: number;
  abstract missingEnv(): string[];

  /** Ask the source for these instruments now (no cache). Must never invent a value. */
  protected abstract fetchQuotes(instruments: Instrument[]): Promise<QuoteBatch>;
  protected abstract fetchCandles(instrument: Instrument, range: HistoryRange): Promise<{ candles: Candle[]; interval: string; intraday: boolean }>;

  protected ensureConfigured(): void {
    const missing = this.missingEnv();
    if (missing.length) {
      throw new ProviderError("NOT_CONFIGURED", `${this.name} is not set up yet. Add the missing settings to the deployment's environment variables.`, { provider: this.id, missing });
    }
  }

  protected quote(ins: Instrument, f: QuoteFields): Quote {
    const prev = positive(f.prevClose);
    const change = prev != null ? f.price - prev : null;
    return {
      key: ins.key, symbol: ins.symbol, name: ins.name, exchange: ins.exchange, kind: ins.kind, sector: ins.sector,
      price: f.price, prevClose: prev, change, changePct: prev != null && change != null ? (change / prev) * 100 : null,
      open: positive(f.open), high: positive(f.high), low: positive(f.low),
      volume: ins.kind === "INDEX" || f.volume == null || f.volume < 0 ? null : f.volume,
      ts: f.ts, provider: this.id, source: this.name, freshness: freshnessOf(this.id, f.ts),
    };
  }

  /** Seconds a quote may be reused: short while the market is open, longer when it is closed. */
  protected quoteTtlMs(): number {
    return marketStatus().open ? (this.official ? 5_000 : 20_000) : 120_000;
  }

  async getQuotes(instruments: Instrument[]): Promise<QuoteBatch> {
    this.ensureConfigured();
    const out = new Map<string, Quote>();
    const need: Instrument[] = [];
    for (const ins of instruments) {
      const hit = cacheGet<Quote>(`q:${this.id}:${ins.key}`);
      if (hit) out.set(ins.key, { ...hit, freshness: freshnessOf(this.id, hit.ts) });
      else need.push(ins);
    }
    let errors: string[] = [];
    if (need.length) {
      const batch = await this.fetchQuotes(need);
      errors = batch.errors;
      const ttl = this.quoteTtlMs();
      for (const q of batch.quotes) {
        cacheSet(`q:${this.id}:${q.key}`, q, ttl);
        out.set(q.key, q);
      }
    }
    return { quotes: instruments.map((i) => out.get(i.key)).filter((q): q is Quote => !!q), errors };
  }

  async getQuote(instrument: Instrument): Promise<Quote> {
    const { quotes, errors } = await this.getQuotes([instrument]);
    if (!quotes[0]) {
      throw new ProviderError("NOT_FOUND", errors[0] ?? `${this.name} has no price for ${instrument.symbol} on ${instrument.exchange}.`, { provider: this.id });
    }
    return quotes[0];
  }

  async getHistoricalCandles(instrument: Instrument, range: HistoryRange): Promise<History> {
    this.ensureConfigured();
    const ttl = range === "1D" ? (marketStatus().open ? 60_000 : 15 * 60_000) : range === "1W" ? 10 * 60_000 : 60 * 60_000;
    return cached(`h:${this.id}:${instrument.key}:${range}`, ttl, async () => {
      const r = await this.fetchCandles(instrument, range);
      return { key: instrument.key, range, interval: r.interval, intraday: r.intraday, candles: tidyCandles(r.candles, range, r.intraday) };
    });
  }

  async searchStocks(text: string, exchange: Exchange | "ALL", limit: number): Promise<Instrument[]> {
    return searchLocal(text, exchange, limit);
  }

  async getMarketStatus(): Promise<MarketStatus> {
    let lastTick: number | null = null;
    for (const ins of indexInstruments(true)) {
      const q = cacheGet<Quote>(`q:${this.id}:${ins.key}`);
      if (q?.ts && (lastTick == null || q.ts > lastTick)) lastTick = q.ts;
    }
    return marketStatus(Date.now(), lastTick);
  }

  /** Every share of the tracking list this source can price in one go (cached as a set). */
  async trackedQuotes(exchange: Exchange): Promise<{ quotes: Quote[]; universe: number; errors: string[] }> {
    this.ensureConfigured();
    const list = trackedInstruments(exchange, this.moversLimit);
    const ttl = marketStatus().open ? (this.official ? 15_000 : 60_000) : 5 * 60_000;
    return cached(`tracked:${this.id}:${exchange}`, ttl, async () => {
      const { quotes, errors } = await this.getQuotes(list);
      if (!quotes.length) throw new ProviderError("PROVIDER_ERROR", errors[0] ?? `${this.name} returned no prices.`, { provider: this.id });
      return { quotes, universe: list.length, errors };
    });
  }

  async getMarketMovers(exchange: Exchange): Promise<Movers> {
    const { quotes, universe } = await this.trackedQuotes(exchange);
    return computeMovers(quotes, universe, universe >= universeInfo.trackedCount ? universeInfo.trackedLabel : `${universe} of the ${universeInfo.trackedLabel}`);
  }
}

/** Rankings and breadth from real quotes. Shares without a previous close are left out, never estimated. */
export function computeMovers(quotes: Quote[], universe: number, universeLabel: string, top = 8): Movers {
  const ranked = quotes.filter((q) => q.changePct != null);
  const byPct = [...ranked].sort((a, b) => (b.changePct as number) - (a.changePct as number));
  const gainers = byPct.filter((q) => (q.changePct as number) > 0).slice(0, top);
  const losers = byPct.filter((q) => (q.changePct as number) < 0).reverse().slice(0, top);
  const mostActive = quotes.filter((q) => q.volume != null && q.volume > 0).sort((a, b) => (b.volume as number) - (a.volume as number)).slice(0, top);
  const mostValue = quotes.filter((q) => q.volume != null && q.volume > 0).sort((a, b) => b.price * (b.volume as number) - a.price * (a.volume as number)).slice(0, top);
  let advances = 0;
  let declines = 0;
  let unchanged = 0;
  const bySector = new Map<string, { sum: number; adv: number; dec: number; n: number }>();
  for (const q of ranked) {
    const c = q.changePct as number;
    if (c > 0) advances++;
    else if (c < 0) declines++;
    else unchanged++;
    if (!q.sector) continue;
    const s = bySector.get(q.sector) ?? { sum: 0, adv: 0, dec: 0, n: 0 };
    s.sum += c;
    s.n++;
    if (c > 0) s.adv++;
    else if (c < 0) s.dec++;
    bySector.set(q.sector, s);
  }
  const sectors: SectorPerformance[] = Array.from(bySector, ([sector, s]) => ({ sector, changePct: s.sum / s.n, advances: s.adv, declines: s.dec, count: s.n }))
    .sort((a, b) => b.changePct - a.changePct);
  return { gainers, losers, mostActive, mostValue, breadth: { advances, declines, unchanged, priced: ranked.length, universe }, sectors, universeLabel };
}

/** Sort, drop duplicates and broken rows; 1D keeps only the most recent trading session. */
export function tidyCandles(candles: Candle[], range: HistoryRange, intraday: boolean): Candle[] {
  const good = candles
    .filter((c) => [c.time, c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v)) && c.close > 0)
    .sort((a, b) => a.time - b.time);
  const out: Candle[] = [];
  for (const c of good) {
    const time = intraday ? Math.floor(c.time) : istDayStartSec(c.time * 1000);
    const last = out[out.length - 1];
    const row = { ...c, time, high: Math.max(c.high, c.open, c.close), low: Math.min(c.low, c.open, c.close) };
    if (last && last.time === time) out[out.length - 1] = row;
    else out.push(row);
  }
  if (range === "1D" && out.length) {
    const day = istDate(out[out.length - 1].time * 1000);
    return out.filter((c) => istDate(c.time * 1000) === day);
  }
  return out;
}
