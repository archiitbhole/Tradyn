#!/usr/bin/env node
/**
 * Browser and API tests against the PRODUCTION build (`npm run build` first).
 *
 *   npm run test:e2e
 *
 * Starts a local stand-in for the data providers (tests/e2e/mock-upstream.mjs — synthetic replies in
 * the providers' documented formats, test-only) and several copies of the app with different
 * settings, then drives them with Playwright (Chromium):
 *   yahoo         a working source (Yahoo format)        -> every page, search, charts, watchlists, simulator
 *   unconfigured  Angel One chosen, no keys              -> setup message naming the missing settings
 *   badauth       Angel One keys refused at sign-in      -> "rejected the sign-in", no credential echoed
 *   outage        source answers HTTP 503                -> provider error, no invented prices
 *   fallback      Angel One refused, Yahoo fallback on   -> prices with a visible fallback notice
 * The credential values below are obvious test strings, not real keys.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startMock } from "./mock-upstream.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
  console.error("No production build found. Run `npm run build` first.");
  process.exit(1);
}

const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const TEST_KEYS = { ANGEL_API_KEY: "e2e-test-key-not-real", ANGEL_CLIENT_CODE: "E2ETEST", ANGEL_MPIN: "0000", ANGEL_TOTP_SECRET: "JBSWY3DPEHPK3PXP" };
const CLEAN = Object.fromEntries(["MARKET_DATA_PROVIDER", "YAHOO_ENABLED", "YAHOO_FALLBACK", "YAHOO_BASE_URL", "ANGEL_API_ROOT", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GROWW_API_KEY", "GROWW_API_SECRET", "GROWW_TOTP_SECRET", "GROWW_ACCESS_TOKEN", ...Object.keys(TEST_KEYS)].map((k) => [k, ""]));

const servers = [];
async function startApp(name, env) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: ROOT, env: { ...process.env, ...CLEAN, ...env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  servers.push(child);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base + "/api/market/status")).ok) return base;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${name} did not start:\n${log}`);
}

let passed = 0;
const failures = [];
async function test(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${String(e?.message ?? e).split("\n").slice(0, 6).join("\n      ")}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const getJson = async (url, init) => { const r = await fetch(url, init); return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) }; };

const mock = await startMock(0);
const M = `http://127.0.0.1:${mock.port}`;
const browser = await chromium.launch();

try {
  const [A, B, C, D, E] = await Promise.all([
    startApp("yahoo", { MARKET_DATA_PROVIDER: "yahoo", YAHOO_BASE_URL: `${M}/yahoo/ok` }),
    startApp("unconfigured", { MARKET_DATA_PROVIDER: "angelone", YAHOO_FALLBACK: "false" }),
    startApp("badauth", { MARKET_DATA_PROVIDER: "angelone", ...TEST_KEYS, ANGEL_API_ROOT: `${M}/angel/badauth`, YAHOO_FALLBACK: "false" }),
    startApp("outage", { MARKET_DATA_PROVIDER: "yahoo", YAHOO_BASE_URL: `${M}/yahoo/down` }),
    startApp("fallback", { MARKET_DATA_PROVIDER: "angelone", ...TEST_KEYS, ANGEL_API_ROOT: `${M}/angel/badauth`, YAHOO_FALLBACK: "true", YAHOO_BASE_URL: `${M}/yahoo/ok` }),
  ]);

  console.log("\nAPI routes");
  await test("indices: NIFTY 50, SENSEX, BANK NIFTY with source, timestamp and unofficial notice", async () => {
    const r = await getJson(A + "/api/market/indices");
    assert(r.status === 200 && r.body.ok, `status ${r.status}`);
    const keys = r.body.data.indices.map((q) => q.key);
    for (const k of ["NSE:NIFTY 50", "BSE:SENSEX", "NSE:NIFTY BANK"]) assert(keys.includes(k), `missing ${k}`);
    assert(r.body.meta.provider === "yahoo" && r.body.meta.official === false && /unofficial/i.test(r.body.meta.notice), "meta");
    assert(r.body.data.indices.every((q) => q.source === "Yahoo Finance" && q.ts && ["live", "delayed", "stale", "closed"].includes(q.freshness)), "quote labels");
  });
  await test("movers, status, search, quote, history", async () => {
    const mv = await getJson(A + "/api/market/movers?exchange=NSE");
    assert(mv.body.ok && mv.body.data.breadth.priced > 0 && mv.body.data.sectors.length > 5, "movers");
    const st = await getJson(A + "/api/market/status");
    assert(st.body.ok && ["open", "pre", "closed", "weekend"].includes(st.body.data.phase), "status");
    const s = await getJson(A + "/api/stocks/search?q=infy");
    assert(s.body.data[0].key === "NSE:INFY", "search");
    const q = await getJson(A + "/api/stocks/quote?symbol=NSE:TCS");
    assert(q.body.ok && q.body.data.price > 0 && q.body.data.provider === "yahoo", "quote");
    for (const range of ["1D", "1W", "1M", "3M", "6M", "1Y", "5Y"]) {
      const h = await getJson(A + `/api/stocks/history?symbol=NSE:TCS&range=${range}`);
      assert(h.body.ok && h.body.data.candles.length > 3, `history ${range}`);
    }
  });
  await test("validation and status codes", async () => {
    assert((await getJson(A + "/api/stocks/quote?symbol=TCS")).status === 400, "bad key -> 400");
    assert((await getJson(A + "/api/stocks/quote?symbol=NSE:ZZZZNOTREAL")).status === 404, "unknown -> 404");
    assert((await getJson(A + "/api/stocks/history?symbol=NSE:TCS&range=2D")).status === 400, "bad range -> 400");
    assert((await getJson(A + "/api/stocks/search?q=")).status === 400, "empty search -> 400");
    const wl = await getJson(A + "/api/watchlists");
    assert(wl.status === 503 && wl.body.error.code === "NOT_CONFIGURED" && wl.body.error.missing.includes("SUPABASE_URL"), "watchlists without Supabase -> 503 with names");
    const xs = await getJson(A + "/api/watchlists", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: '{"name":"x"}' });
    assert(xs.status === 400 && /Cross-site/.test(xs.body.error.message), "cross-site POST blocked");
  });
  await test("rate limit: repeated sign-in attempts get 429 with Retry-After", async () => {
    let last;
    for (let i = 0; i < 12; i++) last = await getJson(B + "/api/auth/sign-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"email":"a@b.co","password":"12345678"}' });
    assert(last.status === 429 && last.body.error.code === "RATE_LIMITED" && Number(last.headers.get("retry-after")) > 0, `got ${last.status}`);
  });
  await test("security headers on pages and API", async () => {
    for (const p of ["/", "/api/market/status"]) {
      const h = (await fetch(A + p)).headers;
      assert(/default-src 'self'/.test(h.get("content-security-policy") ?? ""), `CSP on ${p}`);
      assert(h.get("x-frame-options") === "DENY" && h.get("x-content-type-options") === "nosniff", `headers on ${p}`);
      assert(!h.get("x-powered-by"), "x-powered-by hidden");
    }
  });
  await test("missing credentials: 503 NOT_CONFIGURED naming the settings (names only)", async () => {
    const r = await getJson(B + "/api/market/indices");
    assert(r.status === 503 && r.body.error.code === "NOT_CONFIGURED", `got ${r.status}`);
    assert(r.body.error.missing.includes("ANGEL_API_KEY") && r.body.error.missing.includes("ANGEL_TOTP_SECRET"), "missing names");
  });
  await test("invalid credentials: 502 AUTH_FAILED with the broker's reason, no credential echoed", async () => {
    const r = await getJson(C + "/api/stocks/quote?symbol=NSE:TCS");
    assert(r.status === 502 && r.body.error.code === "AUTH_FAILED" && /Invalid totp/.test(r.body.error.message), `got ${r.status} ${JSON.stringify(r.body)}`);
    const all = JSON.stringify(r.body) + JSON.stringify((await getJson(C + "/api/settings")).body);
    for (const v of Object.values(TEST_KEYS)) assert(!all.includes(v), "credential value leaked");
  });
  await test("provider outage: an error, never a made-up price", async () => {
    const r = await getJson(D + "/api/market/indices");
    assert(!r.body.ok && ["PROVIDER_ERROR", "PROVIDER_UNREACHABLE"].includes(r.body.error.code) && r.status >= 500, `got ${r.status} ${JSON.stringify(r.body)}`);
    const q = await getJson(D + "/api/stocks/quote?symbol=NSE:TCS");
    assert(!q.body.ok && !("data" in q.body), "no data on outage");
  });
  await test("fallback: Yahoo answers and the reply says why", async () => {
    const r = await getJson(E + "/api/stocks/quote?symbol=NSE:TCS");
    assert(r.body.ok && r.body.meta.provider === "yahoo" && r.body.meta.fallbackFrom?.provider === "angelone" && /Invalid totp/.test(r.body.meta.fallbackFrom.reason), JSON.stringify(r.body.meta));
  });

  console.log("\nBrowser — working source");
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await test("every sidebar item opens its page", async () => {
    await page.goto(A + "/");
    const nav = page.getByRole("navigation", { name: "Main" });
    for (const [label, heading] of [["Markets", "Markets"], ["Watchlist", "Watchlist"], ["Stock Explorer", "Stock Explorer"], ["Stock Details", "Stock Details"], ["Market Insights", "Market Insights"], ["Tradyn Simulator", "Tradyn Simulator"], ["Settings", "Settings"], ["Overview", "Overview"]]) {
      await nav.getByRole("link", { name: label }).click();
      await page.getByRole("heading", { level: 1, name: heading }).waitFor({ timeout: 10_000 });
    }
  });
  await test("overview shows indices, breadth, sectors and movers with their source", async () => {
    await page.goto(A + "/");
    await page.getByText("Nifty 50", { exact: true }).first().waitFor();
    await page.getByText("Advances").waitFor();
    await page.getByText("Sector performance").waitFor();
    await page.getByRole("tab", { name: /Losers/ }).click();
    assert(await page.getByText("Yahoo Finance").first().isVisible(), "source shown");
  });
  await test("search opens a stock page; every chart range loads", async () => {
    await page.goto(A + "/");
    await page.keyboard.press("/");
    await page.getByRole("combobox", { name: "Search shares and indices" }).last().fill("reliance");
    await page.getByRole("option").filter({ hasText: "RELIANCE" }).first().click();
    await page.waitForURL(/\/stocks\/NSE%3ARELIANCE/);
    await page.getByRole("heading", { name: "RELIANCE" }).waitFor();
    for (const r of ["1W", "1M", "3M", "6M", "1Y", "5Y", "1D"]) {
      await page.getByRole("button", { name: r, exact: true }).click();
      await page.waitForFunction((r) => document.body.innerText.includes(r === "1D" || r === "1W" ? "min candles" : r === "5Y" ? "1 week candles" : "1 day candles"), r, { timeout: 10_000 });
    }
    assert(await page.locator("canvas").count() > 0, "chart canvas");
    await page.getByText(/Source:/).first().waitFor();
  });
  await test("markets: exchange switch, sort, filter and paging", async () => {
    await page.goto(A + "/markets");
    await page.locator("tbody tr").first().waitFor();
    await page.getByRole("button", { name: "BSE", exact: true }).click();
    await page.getByRole("button", { name: /Change %/ }).click();
    await page.getByPlaceholder("Filter by symbol or name").fill("bank");
    await page.waitForFunction(() => [...document.querySelectorAll("tbody tr")].length > 0 && [...document.querySelectorAll("tbody tr")].every((r) => /bank/i.test(r.textContent)), null, { timeout: 10_000 });
  });
  await test("watchlists: create, rename, add, remove — kept after reload (browser storage)", async () => {
    await page.goto(A + "/watchlist");
    await page.getByRole("button", { name: /New watchlist/ }).click();
    await page.locator("#wl-name").fill("E2E banks");
    await page.getByRole("button", { name: "Create" }).click();
    await page.getByRole("tab", { name: /E2E banks/ }).waitFor();
    await page.getByRole("button", { name: /Options for E2E banks/ }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await page.locator("#wl-name").fill("E2E lenders");
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("tab", { name: /E2E lenders/ }).waitFor();
    await page.getByPlaceholder(/Add a share to/).fill("hdfcbank");
    await page.getByRole("option").filter({ hasText: "HDFCBANK" }).first().click();
    await page.getByRole("link", { name: /HDFCBANK/ }).first().waitFor();
    await page.reload();
    await page.getByRole("tab", { name: /E2E lenders/ }).click();
    await page.getByRole("link", { name: /HDFCBANK/ }).first().waitFor();
    await page.getByRole("button", { name: /Remove HDFCBANK from E2E lenders/ }).click();
    await page.getByText(/empty|Add the shares/i).first().waitFor();
  });
  await test("theme switch applies and persists", async () => {
    await page.goto(A + "/settings");
    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitem", { name: "Light" }).click();
    await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));
    await page.reload();
    assert(!(await page.evaluate(() => document.documentElement.classList.contains("dark"))), "light after reload");
    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitem", { name: "Dark" }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
    // the Settings tiles are the same control
    await page.getByRole("button", { name: "Light", exact: true }).click();
    await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));
    assert((await page.getByRole("button", { name: "Light", exact: true }).getAttribute("aria-pressed")) === "true", "tile shows its state");
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
  });
  await test("simulator: SIMULATION MODE banner, runs, events, experiments, CSV — and never calls the market API", async () => {
    const marketCalls = [];
    // the header's market open/closed pill (/api/market/status) is on every page; no PRICE request may come from the simulator
    const onReq = (r) => { if (/\/api\/(stocks\/|market\/(indices|movers|list))/.test(r.url())) marketCalls.push(r.url()); };
    await page.goto(A + "/simulator");
    page.on("request", onReq);
    await page.getByTestId("simulation-banner").waitFor();
    assert(/Simulation mode/i.test(await page.getByTestId("simulation-banner").innerText()), "banner text");
    await page.getByRole("button", { name: "Step", exact: true }).click();
    await page.getByRole("button", { name: "Positive news" }).click();
    await page.getByRole("button", { name: /Run to end/ }).click();
    await page.getByText("Run complete").waitFor();
    await page.getByRole("tab", { name: /Analysis/ }).click();
    await page.getByText("Strategy performance").waitFor();
    await page.getByRole("tab", { name: /Traders/ }).click();
    await page.getByText("T01").first().waitFor();
    await page.getByRole("tab", { name: /Experiment Lab/ }).click();
    await page.getByRole("button", { name: "10", exact: true }).click();
    await page.getByRole("button", { name: /Run experiment/ }).click();
    await page.getByText(/Interpretation/).waitFor({ timeout: 60_000 });
    await page.getByRole("button", { name: /Export CSV/ }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download Market, step by step/ }).click();
    const file = await download;
    assert(file.suggestedFilename() === "tradyn-sim-market.csv", "csv name");
    await page.keyboard.press("Escape");
    page.off("request", onReq);
    assert(marketCalls.length === 0, `simulator called ${marketCalls.join(", ")}`);
  });
  await test("no console errors on any page", async () => {
    for (const p of ["/", "/markets", "/watchlist", "/explorer", "/stocks", "/stocks/NSE%3ATCS", "/insights", "/simulator", "/settings", "/no-such-page"]) {
      await page.goto(A + p);
      await page.waitForTimeout(600);
    }
    const real = errors.filter((e) => !/404 \(Not Found\)/.test(e));
    assert(real.length === 0, real.slice(0, 5).join("\n"));
  });
  await ctx.close();

  console.log("\nBrowser — responsive layouts");
  for (const [w, h] of [[360, 760], [390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
    await test(`${w}px wide: no sideways scrolling on any page`, async () => {
      const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 700 });
      const p = await c.newPage();
      const wide = [];
      for (const path_ of ["/", "/markets", "/watchlist", "/explorer", "/stocks/NSE%3ARELIANCE", "/insights", "/simulator", "/settings"]) {
        await p.goto(A + path_);
        await p.waitForTimeout(900);
        const sw = await p.evaluate(() => Math.max(document.documentElement.scrollWidth, window.innerWidth));
        if (sw > w + 1) wide.push(`${path_}: ${sw}px`);
      }
      await c.close();
      assert(!wide.length, wide.join(", "));
    });
  }

  console.log("\nBrowser — failure states");
  const fx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const fp = await fx.newPage();
  await test("missing credentials: the page explains what to set up", async () => {
    await fp.goto(B + "/");
    await fp.getByText("Market data is not set up yet").first().waitFor();
    await fp.getByText("ANGEL_API_KEY").first().waitFor();
    await fp.getByRole("link", { name: "Open data settings" }).first().click();
    await fp.getByRole("heading", { level: 1, name: "Settings" }).waitFor();
  });
  await test("invalid credentials: 'rejected the sign-in' and no credential in the page", async () => {
    await fp.goto(C + "/");
    await fp.getByText("The data source rejected the sign-in").first().waitFor();
    const html = await fp.content();
    for (const v of Object.values(TEST_KEYS)) assert(!html.includes(v), "credential in page");
  });
  await test("outage: an error panel with Try again, no prices", async () => {
    await fp.goto(D + "/");
    await fp.getByRole("button", { name: /Try again/ }).first().waitFor({ timeout: 20_000 });
    assert(!(await fp.getByText("Last close").count()), "no quote cards");
  });
  await test("fallback: prices shown with the notice explaining the switch", async () => {
    await fp.goto(E + "/");
    await fp.getByText(/Angel One could not be used, so these prices come from Yahoo Finance/).first().waitFor({ timeout: 20_000 });
  });
  await fx.close();
} finally {
  await browser.close();
  for (const s of servers) s.kill();
  mock.server.close();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
