import { describe, expect, it } from "vitest";
import { instrumentKey, listQuery, quotesQuery, watchlistUpdate } from "@/lib/api/schemas";
import { rateLimit, resetRateLimits } from "@/lib/api/rate-limit";
import { cached, cacheClear, cacheGet, cacheSet } from "@/lib/market-data/cache";
import { freshnessOf, marketStatus } from "@/lib/market-data/session";
import { istStamp, parseAngelFeedTime, parseIstLoose } from "@/lib/market-data/time";
import { getInstrument, searchLocal, trackedInstruments } from "@/lib/market-data/universe";
import { computeMovers, tidyCandles } from "@/lib/providers/base";
import { totp } from "@/lib/providers/totp";
import type { Quote } from "@/types/market";
// @ts-expect-error -- plain JavaScript build script
import { parseAngelMaster } from "../../scripts/sync-instruments.mjs";

const IST = (y: number, mo: number, d: number, h: number, mi: number) => Date.UTC(y, mo - 1, d, h, mi) - 330 * 60_000;

describe("TOTP (RFC 6238)", () => {
  // RFC 6238 test vectors for the SHA-1 secret "12345678901234567890"
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
  ])("t=%i", (t, code) => expect(totp(secret, t * 1000, 8)).toBe(code));
});

describe("market session (NSE/BSE timetable, IST)", () => {
  it("knows open, pre-open, closed and weekend", () => {
    expect(marketStatus(IST(2026, 11, 13, 10, 0)).phase).toBe("open"); // Friday
    expect(marketStatus(IST(2026, 11, 13, 9, 5)).phase).toBe("pre");
    expect(marketStatus(IST(2026, 11, 13, 16, 0))).toMatchObject({ phase: "closed", nextChange: "Opens Monday 09:15 IST" });
    expect(marketStatus(IST(2026, 11, 14, 11, 0)).phase).toBe("weekend");
  });

  it("flags a possible holiday when no index tick arrives during trading hours", () => {
    const now = IST(2026, 11, 13, 12, 0);
    expect(marketStatus(now, now - 45 * 60_000).note).toMatch(/holiday/);
    expect(marketStatus(now, now - 60_000).note).toBeNull();
  });

  it("decides live, delayed, stale and closed", () => {
    const open = IST(2026, 11, 13, 11, 0);
    expect(freshnessOf("angelone", open - 10_000, open)).toBe("live");
    expect(freshnessOf("angelone", open - 10 * 60_000, open)).toBe("stale");
    expect(freshnessOf("angelone", null, open)).toBe("stale");
    expect(freshnessOf("yahoo", open - 60_000, open)).toBe("delayed");
    expect(freshnessOf("angelone", open, IST(2026, 11, 13, 18, 0))).toBe("closed");
  });

  it("reads broker time formats as India time", () => {
    expect(parseAngelFeedTime("13-Nov-2026 15:29:58")).toBe(IST(2026, 11, 13, 15, 29) + 58_000);
    expect(parseAngelFeedTime("garbage")).toBeNull();
    expect(parseIstLoose("2026-11-13 09:15:00")).toBe(IST(2026, 11, 13, 9, 15));
    expect(istStamp(IST(2026, 11, 13, 9, 15))).toBe("2026-11-13 09:15");
  });
});

const q = (symbol: string, changePct: number | null, volume: number | null, sector?: string): Quote => ({
  key: "NSE:" + symbol, symbol, name: symbol, exchange: "NSE", kind: "EQ", price: 100, prevClose: changePct == null ? null : 100, change: changePct, changePct,
  open: null, high: null, low: null, volume, ts: null, provider: "yahoo", source: "Yahoo Finance", freshness: "closed", sector,
});

describe("rankings and breadth", () => {
  it("ranks real changes and leaves out shares without a previous close", () => {
    const m = computeMovers([q("A", 2, 10, "IT"), q("B", -1, 30, "IT"), q("C", 0, 5, "FMCG"), q("D", null, 99, "FMCG")], 4, "test");
    expect(m.gainers.map((x) => x.symbol)).toEqual(["A"]);
    expect(m.losers.map((x) => x.symbol)).toEqual(["B"]);
    expect(m.mostActive[0].symbol).toBe("D"); // volume is real even without a day change
    expect(m.breadth).toEqual({ advances: 1, declines: 1, unchanged: 1, priced: 3, universe: 4 });
    expect(m.sectors.find((s) => s.sector === "IT")).toMatchObject({ changePct: 0.5, count: 2 });
  });

  it("tidies candles: sorts, drops broken rows, keeps only the last session for 1D", () => {
    const day = (d: number, h: number) => IST(2026, 11, d, h, 0) / 1000;
    const out = tidyCandles([
      { time: day(13, 10), open: 1, high: 2, low: 0.5, close: 1.5, volume: 1 },
      { time: day(12, 10), open: 1, high: 2, low: 0.5, close: 1.2, volume: 1 },
      { time: day(13, 11), open: NaN, high: 2, low: 0.5, close: 1.5, volume: 1 },
      { time: day(13, 9), open: 1, high: 0.9, low: 0.95, close: 1.1, volume: 1 },
    ], "1D", true);
    expect(out.map((c) => c.time)).toEqual([day(13, 9), day(13, 10)]);
    expect(out[0].high).toBe(1.1); // high/low made consistent with open and close
  });
});

describe("instrument list", () => {
  it("always contains the tracking list and the headline indices", () => {
    expect(trackedInstruments("NSE").length).toBeGreaterThanOrEqual(90);
    expect(getInstrument("NSE:NIFTY 50")?.kind).toBe("INDEX");
    expect(getInstrument("BSE:SENSEX")?.kind).toBe("INDEX");
  });

  it("covers every sector when a source can price only part of the list", () => {
    const sectors = new Set(trackedInstruments("NSE", 22).map((i) => i.sector));
    expect(sectors.size).toBeGreaterThanOrEqual(10);
  });

  it("searches by symbol first, then by name", () => {
    expect(searchLocal("INFY", "NSE")[0].key).toBe("NSE:INFY");
    expect(searchLocal("state bank", "ALL").some((i) => i.symbol === "SBIN")).toBe(true);
    expect(searchLocal("", "ALL")).toEqual([]);
  });

  it("reads Angel One's instrument master: shares only, no derivatives", () => {
    const r = parseAngelMaster([
      { token: "2885", symbol: "RELIANCE-EQ", name: "RELIANCE", exch_seg: "NSE", instrumenttype: "" },
      { token: "500325", symbol: "RELIANCE", name: "RELIANCE", exch_seg: "BSE", instrumenttype: "" },
      { token: "99926000", symbol: "Nifty 50", name: "Nifty 50", exch_seg: "NSE", instrumenttype: "AMXIDX" },
      { token: "35001", symbol: "RELIANCE26NOVFUT", name: "RELIANCE", exch_seg: "NFO", instrumenttype: "FUTSTK" },
      { token: "1", symbol: "XYZ-N1", name: "bond", exch_seg: "NSE", instrumenttype: "" },
    ]);
    expect(r.instruments).toEqual([{ s: "RELIANCE", n: "RELIANCE", e: "NSE", t: "2885" }, { s: "RELIANCE", n: "RELIANCE", e: "BSE", t: "500325" }]);
    expect(r.indices).toEqual([{ name: "NIFTY 50", exchange: "NSE", token: "99926000" }]);
  });
});

describe("request validation", () => {
  it("accepts real instrument keys and refuses everything else", () => {
    for (const k of ["NSE:RELIANCE", "NSE:M&M", "NSE:BAJAJ-AUTO", "NSE:NIFTY 50", "BSE:SENSEX"]) expect(instrumentKey.safeParse(k).success).toBe(true);
    for (const k of ["RELIANCE", "NYSE:IBM", "NSE:<script>", "NSE:" + "A".repeat(60)]) expect(instrumentKey.safeParse(k).success).toBe(false);
  });

  it("limits batch size, page size and watchlist changes", () => {
    expect(quotesQuery.safeParse({ symbols: Array.from({ length: 61 }, (_, i) => "NSE:S" + i).join(",") }).success).toBe(false);
    expect(listQuery.parse({ pageSize: "25" }).pageSize).toBe(25);
    expect(listQuery.safeParse({ pageSize: "500" }).success).toBe(false);
    expect(watchlistUpdate.safeParse({ id: "8d2b8c5e-3f6a-4f0b-9c1d-2e3f4a5b6c7d", name: "x", add: "NSE:TCS" }).success).toBe(false);
  });
});

describe("cache and rate limit", () => {
  it("caches values, shares concurrent loads and never caches errors", async () => {
    cacheClear();
    cacheSet("a", 1, 1000, 0);
    expect(cacheGet("a", 500)).toBe(1);
    expect(cacheGet("a", 1500)).toBeUndefined();
    let n = 0;
    const load = async () => ++n;
    const [x, y] = await Promise.all([cached("b", 1000, load), cached("b", 1000, load)]);
    expect([x, y, n]).toEqual([1, 1, 1]);
    await expect(cached("c", 1000, async () => { throw new Error("down"); })).rejects.toThrow("down");
    expect(await cached("c", 1000, async () => "up")).toBe("up");
  });

  it("allows `limit` requests per window", () => {
    resetRateLimits();
    const results = Array.from({ length: 4 }, () => rateLimit("1.2.3.4", "t", 3, 60_000, 1000).ok);
    expect(results).toEqual([true, true, true, false]);
    expect(rateLimit("1.2.3.4", "t", 3, 60_000, 62_000).ok).toBe(true);
  });
});
