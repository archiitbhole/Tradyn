import "server-only";
import type { Candle, HistoryRange, Instrument, Quote } from "@/types/market";
import { indexDef } from "@/lib/market-data/universe";
import { mapLimit } from "@/lib/utils/async";
import { arr, num, rec, str, type Rec } from "@/lib/utils/safe";
import { BaseProvider } from "./base";
import { env } from "./env";
import { ProviderError } from "./errors";
import { fetchJson } from "./http";
import type { QuoteBatch } from "./types";

/**
 * Yahoo Finance public chart feed — no account needed.
 * NOT an official API: it is the JSON feed behind Yahoo's own charts. NSE/BSE prices on it can be
 * delayed, it has no service guarantee and it can change or block requests without notice. It is the
 * optional fallback; use a broker API (Angel One / Groww) for dependable real-time data.
 */
const ROOT = "https://query1.finance.yahoo.com";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; Tradyn/3.0)", Accept: "application/json" };

const PLAN: Record<HistoryRange, { interval: string; range: string; label: string; intraday: boolean }> = {
  "1D": { interval: "5m", range: "1d", label: "5 min", intraday: true },
  "1W": { interval: "15m", range: "5d", label: "15 min", intraday: true },
  "1M": { interval: "1d", range: "1mo", label: "1 day", intraday: false },
  "3M": { interval: "1d", range: "3mo", label: "1 day", intraday: false },
  "6M": { interval: "1d", range: "6mo", label: "1 day", intraday: false },
  "1Y": { interval: "1d", range: "1y", label: "1 day", intraday: false },
  "5Y": { interval: "1wk", range: "5y", label: "1 week", intraday: false },
};

export function yahooTicker(ins: Instrument): string | null {
  if (ins.kind === "INDEX") return indexDef(ins.symbol)?.yahoo ?? null;
  return ins.symbol + (ins.exchange === "BSE" ? ".BO" : ".NS");
}

function candlesOf(result: Rec, withVolume: boolean): Candle[] {
  const ts = arr(result.timestamp);
  const q = rec(arr(rec(result.indicators).quote)[0]);
  const [o, h, l, c, v] = [arr(q.open), arr(q.high), arr(q.low), arr(q.close), arr(q.volume)];
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const t = num(ts[i]);
    const close = num(c[i]);
    if (t == null || close == null) continue; // Yahoo leaves gaps as null: skipped, never filled in
    out.push({ time: t, open: num(o[i]) ?? close, high: num(h[i]) ?? close, low: num(l[i]) ?? close, close, volume: withVolume ? num(v[i]) : null });
  }
  return out;
}

export class YahooProvider extends BaseProvider {
  readonly id = "yahoo" as const;
  readonly name = "Yahoo Finance";
  readonly official = false;
  readonly delayed = true;
  readonly note = "Public chart feed, no login. Unofficial and may be delayed — not guaranteed real-time for NSE or BSE.";
  // no bulk endpoint: one request per share
  readonly moversLimit = 50;

  missingEnv(): string[] {
    return [];
  }

  private async chart(ins: Instrument, interval: string, range: string): Promise<Rec> {
    const ticker = yahooTicker(ins);
    if (!ticker) throw new ProviderError("NOT_FOUND", `Yahoo Finance does not provide ${ins.symbol}.`, { provider: this.id });
    const { status, data } = await fetchJson(`${env("YAHOO_BASE_URL") || ROOT}/v8/finance/chart/${encodeURIComponent(ticker)}`, {
      provider: this.id, label: this.name, headers: HEADERS, query: { interval, range, includePrePost: "false" }, timeoutMs: 7000,
    });
    const chart = rec(rec(data).chart);
    const result = rec(arr(chart.result)[0]);
    if (status === 404 || chart.error || !arr(chart.result).length) {
      const why = str(rec(chart.error).description);
      throw new ProviderError("NOT_FOUND", `Yahoo Finance has no data for ${ins.symbol} on ${ins.exchange}${why ? ` (${why})` : ""}.`, { provider: this.id });
    }
    if (status === 401 || status === 403) throw new ProviderError("PROVIDER_UNREACHABLE", "Yahoo Finance refused the request from this server.", { provider: this.id });
    if (status >= 400) throw new ProviderError("PROVIDER_ERROR", `Yahoo Finance answered HTTP ${status}.`, { provider: this.id });
    return result;
  }

  protected async fetchQuotes(instruments: Instrument[]): Promise<QuoteBatch> {
    const errors: string[] = [];
    let fatal: ProviderError | null = null;
    let failures = 0;
    const rows = await mapLimit(instruments, 8, async (ins): Promise<Quote | null> => {
      if (fatal) return null;
      try {
        const r = await this.chart(ins, "5m", "1d");
        const meta = rec(r.meta);
        const price = num(meta.regularMarketPrice);
        if (price == null || price <= 0) return null;
        const day = candlesOf(r, false);
        const t = num(meta.regularMarketTime);
        return this.quote(ins, {
          price, prevClose: num(meta.previousClose) ?? num(meta.chartPreviousClose), open: day[0]?.open ?? null,
          high: num(meta.regularMarketDayHigh), low: num(meta.regularMarketDayLow), volume: num(meta.regularMarketVolume), ts: t != null ? t * 1000 : null,
        });
      } catch (e) {
        if (e instanceof ProviderError && e.code === "NOT_FOUND") {
          errors.push(e.message);
          return null;
        }
        failures++;
        const err = e instanceof ProviderError ? e : new ProviderError("PROVIDER_ERROR", "Yahoo Finance request failed.", { provider: this.id });
        // stop early when the source is clearly down or blocking, instead of waiting for every share to time out
        if (err.code === "RATE_LIMITED" || failures >= 4) fatal = err;
        errors.push(`${ins.symbol}: ${err.message}`);
        return null;
      }
    });
    const quotes = rows.filter((q): q is Quote => !!q);
    if (!quotes.length && fatal) throw fatal;
    if (!quotes.length && failures && failures === instruments.length) throw new ProviderError("PROVIDER_UNREACHABLE", errors[0] ?? "Yahoo Finance could not be reached.", { provider: this.id });
    return { quotes, errors };
  }

  protected async fetchCandles(ins: Instrument, range: HistoryRange) {
    const plan = PLAN[range];
    const r = await this.chart(ins, plan.interval, plan.range);
    return { candles: candlesOf(r, ins.kind !== "INDEX"), interval: plan.label, intraday: plan.intraday };
  }
}
