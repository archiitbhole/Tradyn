import { vi } from "vitest";

export type Route = (url: URL, init: RequestInit & { json?: unknown }) => { status?: number; body?: unknown; text?: string } | Promise<{ status?: number; body?: unknown; text?: string }>;

/**
 * Replaces global fetch with a fake that answers from `route`. Replies follow the formats in the
 * providers' public documentation; they are test fixtures only and never reach the app.
 * Returns the list of requests made, so tests can check what was sent.
 */
export function fakeFetch(route: Route) {
  const calls: { url: URL; method: string; headers: Record<string, string>; json?: unknown }[] = [];
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const json = typeof init.body === "string" && init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init.method ?? "GET", headers: (init.headers ?? {}) as Record<string, string>, json });
    const r = await route(url, { ...init, json });
    const text = r.text ?? (r.body === undefined ? "" : JSON.stringify(r.body));
    return new Response(text, { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  });
  return calls;
}

export function unreachable() {
  vi.stubGlobal("fetch", async () => {
    throw new TypeError("fetch failed");
  });
}

/** A Yahoo chart reply for one day of 5-minute candles. */
export function yahooChart(price: number, prevClose: number, opts: { gaps?: boolean; ts?: number } = {}) {
  const t0 = Math.floor((opts.ts ?? Date.now()) / 1000) - 3600;
  const timestamp = [0, 1, 2, 3].map((i) => t0 + i * 300);
  const close = [price - 3, opts.gaps ? null : price - 2, price - 1, price];
  return {
    chart: {
      result: [{
        meta: { currency: "INR", regularMarketPrice: price, previousClose: prevClose, regularMarketTime: Math.floor((opts.ts ?? Date.now()) / 1000), regularMarketDayHigh: price + 5, regularMarketDayLow: price - 6, regularMarketVolume: 123456 },
        timestamp,
        indicators: { quote: [{ open: close.map((c) => (c == null ? null : c - 0.5)), high: close.map((c) => (c == null ? null : c + 1)), low: close.map((c) => (c == null ? null : c - 1)), close, volume: [10, 20, 30, 40] }] },
      }],
      error: null,
    },
  };
}
