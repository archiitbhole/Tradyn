import "server-only";
import type { Exchange, History, HistoryRange, IndicesPayload, Instrument, MarketList, MarketRow, MarketStatus, Movers, ProviderId, Quote, ResponseMeta, SortKey } from "@/types/market";
import type { BaseProvider } from "@/lib/providers/base";
import { ProviderError, isProviderError } from "@/lib/providers/errors";
import { getProvider, selectProvider, yahooFallbackEnabled } from "@/lib/providers";
import { getInstrument, indexInstruments, listInstruments, trackedInstruments, universeInfo } from "./universe";

export interface Served<T> {
  data: T;
  meta: ResponseMeta;
}

// Failures of the source itself. "Not found" is an answer, not a failure, so it never triggers the fallback.
const FALLBACK_CODES = new Set(["NOT_CONFIGURED", "AUTH_FAILED", "PROVIDER_ERROR", "PROVIDER_UNREACHABLE", "RATE_LIMITED"]);

function metaOf(p: BaseProvider, fallbackFrom?: ResponseMeta["fallbackFrom"]): ResponseMeta {
  return {
    provider: p.id, source: p.name, official: p.official, fetchedAt: Date.now(), fallbackFrom,
    notice: p.delayed ? "Yahoo Finance is an unofficial source. Prices may be delayed and are not guaranteed to be real-time." : undefined,
  };
}

/**
 * Runs a request against the selected source. If that source fails and the Yahoo fallback is
 * allowed, Yahoo answers instead and the reply says so (meta.fallbackFrom) — the switch is never silent.
 * There is no simulated or made-up data path: when nothing can answer, the error is returned.
 */
export async function serve<T>(run: (p: BaseProvider) => Promise<T>): Promise<Served<T>> {
  const sel = selectProvider();
  if (!sel.primary) {
    const missing = Array.from(new Set([...getProvider("angelone").missingEnv(), ...getProvider("groww").missingEnv()]));
    throw new ProviderError("NOT_CONFIGURED", sel.problem ?? "No market-data source is configured.", { missing });
  }
  const primary = getProvider(sel.primary);
  try {
    return { data: await run(primary), meta: metaOf(primary) };
  } catch (e) {
    if (!isProviderError(e) || !FALLBACK_CODES.has(e.code) || primary.id === "yahoo" || !yahooFallbackEnabled()) throw e;
    const yahoo = getProvider("yahoo");
    try {
      return { data: await run(yahoo), meta: metaOf(yahoo, { provider: primary.id as ProviderId, reason: e.message }) };
    } catch {
      throw e; // report the problem with the source the deployment actually chose
    }
  }
}

function need(key: string): Instrument {
  const ins = getInstrument(key);
  if (!ins) throw new ProviderError("NOT_FOUND", `"${key}" is not a share or index Tradyn knows on NSE or BSE.`);
  return ins;
}

export function getStatus(): Promise<Served<MarketStatus>> {
  return serve((p) => p.getMarketStatus());
}

export function getIndices(): Promise<Served<IndicesPayload>> {
  return serve(async (p) => {
    const list = indexInstruments(false);
    const { quotes } = await p.getQuotes(list);
    const got = new Set(quotes.map((q) => q.key));
    if (!quotes.length) throw new ProviderError("PROVIDER_ERROR", `${p.name} returned no index prices.`, { provider: p.id });
    return { indices: quotes, unavailable: list.filter((i) => !got.has(i.key)).map((i) => i.name), status: await p.getMarketStatus() };
  });
}

export function getMovers(exchange: Exchange): Promise<Served<Movers>> {
  return serve((p) => p.getMarketMovers(exchange));
}

export async function getQuote(key: string): Promise<Served<Quote>> {
  const ins = need(key);
  return serve((p) => p.getQuote(ins));
}

export function getQuotes(keys: string[]): Promise<Served<{ quotes: Quote[]; missing: string[] }>> {
  const list = keys.map((k) => getInstrument(k)).filter((i): i is Instrument => !!i);
  return serve(async (p) => {
    if (!list.length) return { quotes: [], missing: keys };
    const { quotes } = await p.getQuotes(list);
    const got = new Set(quotes.map((q) => q.key));
    return { quotes, missing: keys.filter((k) => !got.has(k)) };
  });
}

export async function getHistory(key: string, range: HistoryRange): Promise<Served<History>> {
  const ins = need(key);
  return serve((p) => p.getHistoricalCandles(ins, range));
}

export function searchStocks(text: string, exchange: Exchange | "ALL", limit: number): Promise<Served<Instrument[]>> {
  return serve((p) => p.searchStocks(text, exchange, limit));
}

export interface ListParams {
  exchange: Exchange;
  scope: "tracked" | "all";
  q?: string;
  sector?: string;
  sort: SortKey;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
}

const NAME_SORTS: SortKey[] = ["symbol", "name"];
const ALL_SORTS: SortKey[] = ["symbol", "name", "price", "change", "changePct", "volume", "high", "low", "prevClose"];

function compare(a: MarketRow, b: MarketRow, sort: SortKey, dir: 1 | -1): number {
  if (sort === "symbol" || sort === "name") return dir * a.instrument[sort].localeCompare(b.instrument[sort]);
  const x = a.quote?.[sort] ?? null;
  const y = b.quote?.[sort] ?? null;
  if (x == null && y == null) return a.instrument.symbol.localeCompare(b.instrument.symbol);
  if (x == null) return 1; // rows without a value always go last
  if (y == null) return -1;
  return dir * (x - y) || a.instrument.symbol.localeCompare(b.instrument.symbol);
}

/**
 * The Markets table. "tracked" prices the whole tracking list, so it can be ordered by any column.
 * "all" lists every share on the exchange by name and prices only the page being shown — ordering
 * several thousand shares by price would need a whole-market feed that these sources do not offer.
 */
export function getMarketList(params: ListParams): Promise<Served<MarketList>> {
  const { exchange, scope, q, sector, page, pageSize } = params;
  const dir = params.dir === "desc" ? -1 : 1;
  return serve(async (p) => {
    if (scope === "tracked") {
      const { quotes } = await p.trackedQuotes(exchange);
      const byKey = new Map(quotes.map((x) => [x.key, x]));
      const t = q?.trim().toUpperCase();
      let rows: MarketRow[] = trackedInstruments(exchange).map((instrument) => ({ instrument, quote: byKey.get(instrument.key) ?? null }));
      if (sector) rows = rows.filter((r) => r.instrument.sector === sector);
      if (t) rows = rows.filter((r) => r.instrument.symbol.includes(t) || r.instrument.name.toUpperCase().includes(t));
      rows.sort((a, b) => compare(a, b, params.sort, dir));
      const total = rows.length;
      const slice = rows.slice((page - 1) * pageSize, page * pageSize);
      const unpriced = rows.filter((r) => !r.quote).length;
      return {
        rows: slice, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), sortable: ALL_SORTS, scope, exchange,
        priced: slice.filter((r) => r.quote).length,
        note: unpriced ? `${unpriced} of ${total} shares have no price from ${p.name} right now${p.moversLimit < universeInfo.trackedCount ? ` (it prices ${p.moversLimit} shares per refresh)` : ""}.` : null,
      };
    }
    const sort: "symbol" | "name" = params.sort === "name" ? "name" : "symbol";
    const all = listInstruments({ exchange, scope, q, sector });
    all.sort((a, b) => dir * a[sort].localeCompare(b[sort]));
    const total = all.length;
    const slice = all.slice((page - 1) * pageSize, page * pageSize);
    const { quotes } = slice.length ? await p.getQuotes(slice) : { quotes: [] };
    const byKey = new Map(quotes.map((x) => [x.key, x]));
    return {
      rows: slice.map((instrument) => ({ instrument, quote: byKey.get(instrument.key) ?? null })), total, page, pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)), sortable: NAME_SORTS, scope, exchange, priced: quotes.length,
      note: universeInfo.full ? null : "The full exchange list has not been downloaded for this build, so this shows the built-in list. Run `npm run instruments:sync`.",
    };
  });
}
