import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheClear } from "@/lib/market-data/cache";
import { getInstrument } from "@/lib/market-data/universe";
import { getProvider } from "@/lib/providers";
import { ProviderError } from "@/lib/providers/errors";
import { parseOhlc } from "@/lib/providers/groww";
import { clearTokenMemory } from "@/lib/providers/token-store";
import { fakeFetch, unreachable, yahooChart } from "./helpers";

const ANGEL_ENV = { ANGEL_API_KEY: "test-api-key", ANGEL_CLIENT_CODE: "T1234", ANGEL_MPIN: "1111", ANGEL_TOTP_SECRET: "JBSWY3DPEHPK3PXP" };
const reliance = () => getInstrument("NSE:RELIANCE")!;

beforeEach(() => {
  cacheClear();
  clearTokenMemory();
  vi.unstubAllEnvs();
  for (const k of ["MARKET_DATA_PROVIDER", "YAHOO_ENABLED", "YAHOO_FALLBACK", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GROWW_ACCESS_TOKEN", "GROWW_API_KEY", "GROWW_API_SECRET", "GROWW_TOTP_SECRET", ...Object.keys(ANGEL_ENV)]) vi.stubEnv(k, "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function rejects(p: Promise<unknown>): Promise<ProviderError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ProviderError);
    return e as ProviderError;
  }
  throw new Error("expected a ProviderError");
}

describe("Angel One SmartAPI", () => {
  const angel = () => getProvider("angelone");

  it("lists missing settings by name and never calls the API without them", async () => {
    const calls = fakeFetch(() => ({ body: {} }));
    expect(angel().missingEnv()).toEqual(Object.keys(ANGEL_ENV));
    const e = await rejects(angel().getQuote(reliance()));
    expect(e.code).toBe("NOT_CONFIGURED");
    expect(e.missing).toContain("ANGEL_API_KEY");
    expect(calls).toHaveLength(0);
  });

  it("signs in with a TOTP, looks up the token and parses a FULL quote", async () => {
    for (const [k, v] of Object.entries(ANGEL_ENV)) vi.stubEnv(k, v);
    const calls = fakeFetch((url) => {
      if (url.pathname.endsWith("loginByPassword")) return { body: { status: true, message: "SUCCESS", data: { jwtToken: "jwt-1" } } };
      if (url.pathname.endsWith("searchScrip")) return { body: { status: true, data: [{ tradingsymbol: "RELIANCE-EQ", symboltoken: "2885" }] } };
      if (url.pathname.endsWith("/quote")) return { body: { status: true, data: { fetched: [{ exchange: "NSE", symbolToken: "2885", ltp: 1310.5, close: 1300, open: 1302, high: 1315, low: 1298, tradeVolume: 4200000, exchFeedTime: "13-Nov-2026 15:29:58" }] } } };
      return { status: 404, body: {} };
    });
    const q = await angel().getQuote(reliance());
    expect(q).toMatchObject({ price: 1310.5, prevClose: 1300, open: 1302, high: 1315, low: 1298, volume: 4200000, provider: "angelone", source: "Angel One SmartAPI" });
    expect(q.change).toBeCloseTo(10.5);
    expect(q.changePct).toBeCloseTo(0.8077, 3);
    expect(q.ts).toBe(Date.UTC(2026, 10, 13, 9, 59, 58)); // 15:29:58 IST
    const login = calls.find((c) => c.url.pathname.endsWith("loginByPassword"))!;
    expect((login.json as Record<string, string>).totp).toMatch(/^\d{6}$/);
    expect(calls.find((c) => c.url.pathname.endsWith("/quote"))!.headers.Authorization).toBe("Bearer jwt-1");
  });

  it("signs in again once when the session has expired", async () => {
    for (const [k, v] of Object.entries(ANGEL_ENV)) vi.stubEnv(k, v);
    let logins = 0;
    let quotes = 0;
    fakeFetch((url) => {
      if (url.pathname.endsWith("loginByPassword")) return { body: { status: true, data: { jwtToken: "jwt-" + ++logins } } };
      if (url.pathname.endsWith("searchScrip")) return { body: { status: true, data: [{ tradingsymbol: "RELIANCE-EQ", symboltoken: "2885" }] } };
      if (++quotes === 1) return { status: 401, body: { status: false, errorcode: "AG8001", message: "Invalid Token" } };
      return { body: { status: true, data: { fetched: [{ exchange: "NSE", symbolToken: "2885", ltp: 1310, close: 1300 }] } } };
    });
    const q = await angel().getQuote(reliance());
    expect(q.price).toBe(1310);
    expect(logins).toBe(2);
  });

  it("reports a refused sign-in as AUTH_FAILED without echoing credentials", async () => {
    for (const [k, v] of Object.entries(ANGEL_ENV)) vi.stubEnv(k, v);
    fakeFetch(() => ({ body: { status: false, message: "Invalid totp", errorcode: "AB1050", data: null } }));
    const e = await rejects(angel().getQuote(reliance()));
    expect(e.code).toBe("AUTH_FAILED");
    expect(e.message).toContain("Invalid totp");
    for (const v of Object.values(ANGEL_ENV)) expect(e.message).not.toContain(v);
  });

  it("rejects a TOTP secret that is not base32", async () => {
    for (const [k, v] of Object.entries(ANGEL_ENV)) vi.stubEnv(k, v);
    vi.stubEnv("ANGEL_TOTP_SECRET", "not base32 at all!");
    fakeFetch(() => ({ body: {} }));
    expect((await rejects(angel().getQuote(reliance()))).code).toBe("AUTH_FAILED");
  });
});

describe("Groww Trade API", () => {
  const groww = () => getProvider("groww");

  it("accepts any of the three sign-in methods", () => {
    expect(groww().missingEnv()).toHaveLength(2);
    vi.stubEnv("GROWW_API_KEY", "k");
    expect(groww().missingEnv()).toEqual(["GROWW_API_SECRET or GROWW_TOTP_SECRET"]);
    vi.stubEnv("GROWW_TOTP_SECRET", "JBSWY3DPEHPK3PXP");
    expect(groww().missingEnv()).toEqual([]);
    vi.stubEnv("GROWW_API_KEY", "");
    vi.stubEnv("GROWW_TOTP_SECRET", "");
    vi.stubEnv("GROWW_ACCESS_TOKEN", "t");
    expect(groww().missingEnv()).toEqual([]);
  });

  it("parses OHLC sent as an object or as text", () => {
    expect(parseOhlc({ open: 1, high: 2, low: 0.5, close: 1.5 })).toEqual({ open: 1, high: 2, low: 0.5, close: 1.5 });
    expect(parseOhlc("{open: 149.5,high: 150.5,low: 148.5,close: 149.5}")).toEqual({ open: 149.5, high: 150.5, low: 148.5, close: 149.5 });
  });

  it("derives the previous close from day_change and explains an expired access token", async () => {
    vi.stubEnv("GROWW_ACCESS_TOKEN", "test-token");
    fakeFetch(() => ({ body: { status: "SUCCESS", payload: { last_price: 250, day_change: -5, ohlc: "{open: 254,high: 256,low: 249,close: 255}", volume: 1000, last_trade_time: 1794571800000 } } }));
    const q = await groww().getQuote(getInstrument("NSE:ITC")!);
    expect(q).toMatchObject({ price: 250, prevClose: 255, change: -5, open: 254, high: 256, low: 249, volume: 1000, ts: 1794571800000 });

    cacheClear();
    fakeFetch(() => ({ status: 401, body: { status: "FAILURE", error: { message: "Unauthorized" } } }));
    const e = await rejects(groww().getQuote(getInstrument("NSE:TCS")!));
    expect(e.code).toBe("AUTH_FAILED");
    expect(e.message).toContain("expire every morning");
  });
});

describe("Yahoo Finance (unofficial)", () => {
  const yahoo = () => getProvider("yahoo");

  it("is labelled unofficial and delayed", () => {
    expect(yahoo().official).toBe(false);
    expect(yahoo().delayed).toBe(true);
    expect(yahoo().note).toMatch(/not guaranteed real-time/);
  });

  it("asks for .NS / .BO tickers and never fills gaps in candles", async () => {
    const calls = fakeFetch(() => ({ body: yahooChart(1000, 990, { gaps: true }) }));
    const q = await yahoo().getQuote(getInstrument("BSE:INFY")!);
    expect(calls[0].url.pathname).toContain("INFY.BO");
    expect(q).toMatchObject({ price: 1000, prevClose: 990, provider: "yahoo" });
    const h = await yahoo().getHistoricalCandles(getInstrument("NSE:INFY")!, "1D");
    expect(h.candles.length).toBe(3); // the null candle is dropped, not invented
  });

  it("reports an unknown ticker as NOT_FOUND and an outage as PROVIDER_UNREACHABLE", async () => {
    fakeFetch(() => ({ status: 404, body: { chart: { result: null, error: { code: "Not Found", description: "No data found" } } } }));
    expect((await rejects(yahoo().getHistoricalCandles(reliance(), "1M"))).code).toBe("NOT_FOUND");
    unreachable();
    expect((await rejects(yahoo().getQuote(getInstrument("NSE:TCS")!))).code).toBe("PROVIDER_UNREACHABLE");
  });

  it("turns HTTP 429 into RATE_LIMITED", async () => {
    fakeFetch(() => ({ status: 429, text: "Too Many Requests" }));
    expect((await rejects(yahoo().getQuote(getInstrument("NSE:SBIN")!))).code).toBe("RATE_LIMITED");
  });
});
