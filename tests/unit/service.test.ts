import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheClear } from "@/lib/market-data/cache";
import { getQuote, getIndices } from "@/lib/market-data/service";
import { selectProvider } from "@/lib/providers";
import { clearTokenMemory } from "@/lib/providers/token-store";
import { fakeFetch, unreachable, yahooChart } from "./helpers";

const ANGEL_ENV = { ANGEL_API_KEY: "test-api-key", ANGEL_CLIENT_CODE: "T1234", ANGEL_MPIN: "1111", ANGEL_TOTP_SECRET: "JBSWY3DPEHPK3PXP" };

beforeEach(() => {
  cacheClear();
  clearTokenMemory();
  for (const k of ["MARKET_DATA_PROVIDER", "YAHOO_ENABLED", "YAHOO_FALLBACK", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GROWW_ACCESS_TOKEN", "GROWW_API_KEY", "GROWW_API_SECRET", "GROWW_TOTP_SECRET", ...Object.keys(ANGEL_ENV)]) vi.stubEnv(k, "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("provider selection", () => {
  it("picks Angel One, then Groww, then Yahoo, and honours MARKET_DATA_PROVIDER", () => {
    expect(selectProvider()).toMatchObject({ primary: "yahoo", mode: "auto" });
    vi.stubEnv("GROWW_ACCESS_TOKEN", "t");
    expect(selectProvider().primary).toBe("groww");
    for (const [k, v] of Object.entries(ANGEL_ENV)) vi.stubEnv(k, v);
    expect(selectProvider().primary).toBe("angelone");
    vi.stubEnv("MARKET_DATA_PROVIDER", "yahoo");
    expect(selectProvider()).toMatchObject({ primary: "yahoo", mode: "explicit" });
    vi.stubEnv("MARKET_DATA_PROVIDER", "moneycontrol");
    expect(selectProvider().problem).toMatch(/angelone, groww or yahoo/);
  });

  it("has no source at all when Yahoo is switched off and no broker is set up", () => {
    vi.stubEnv("YAHOO_ENABLED", "false");
    expect(selectProvider()).toMatchObject({ primary: null });
  });
});

describe("serving data", () => {
  it("answers with the chosen source and says which one it was", async () => {
    vi.stubEnv("MARKET_DATA_PROVIDER", "yahoo");
    fakeFetch(() => ({ body: yahooChart(500, 480) }));
    const r = await getQuote("NSE:TCS");
    expect(r.meta).toMatchObject({ provider: "yahoo", source: "Yahoo Finance", official: false });
    expect(r.meta.notice).toMatch(/unofficial/i);
    expect(r.meta.fallbackFrom).toBeUndefined();
  });

  it("uses the Yahoo fallback only when allowed, and labels the switch", async () => {
    vi.stubEnv("MARKET_DATA_PROVIDER", "angelone");
    for (const [k, v] of Object.entries(ANGEL_ENV)) vi.stubEnv(k, v);
    fakeFetch((url) => (url.hostname.includes("yahoo") ? { body: yahooChart(500, 480) } : { body: { status: false, message: "Invalid totp", errorcode: "AB1050" } }));
    const r = await getQuote("NSE:TCS");
    expect(r.meta.provider).toBe("yahoo");
    expect(r.meta.fallbackFrom).toMatchObject({ provider: "angelone" });
    expect(r.meta.fallbackFrom?.reason).toMatch(/Invalid totp/);

    cacheClear();
    clearTokenMemory();
    vi.stubEnv("YAHOO_FALLBACK", "false");
    await expect(getQuote("NSE:INFY")).rejects.toMatchObject({ code: "AUTH_FAILED", provider: "angelone" });
  });

  it("returns an error instead of any made-up price when every source fails", async () => {
    vi.stubEnv("MARKET_DATA_PROVIDER", "yahoo");
    unreachable();
    await expect(getIndices()).rejects.toMatchObject({ code: "PROVIDER_UNREACHABLE" });
  });

  it("refuses unknown instruments before calling any source", async () => {
    const calls = fakeFetch(() => ({ body: {} }));
    await expect(getQuote("NSE:NOTAREALSHARE")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(calls).toHaveLength(0);
  });

  it("names the missing settings when nothing is configured", async () => {
    vi.stubEnv("YAHOO_ENABLED", "false");
    await expect(getQuote("NSE:TCS")).rejects.toMatchObject({ code: "NOT_CONFIGURED", missing: expect.arrayContaining(["ANGEL_API_KEY"]) });
  });
});
