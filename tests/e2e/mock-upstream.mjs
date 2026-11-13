/**
 * TEST FIXTURE ONLY — a local stand-in for the market-data providers, used by the browser tests
 * (tests/e2e/run.mjs) so the app can be exercised without network access or broker accounts.
 * It answers in the providers' documented reply formats with SYNTHETIC numbers. The app itself
 * never contains or serves made-up prices; this file is not part of the build.
 *
 *   /yahoo/ok/v8/finance/chart/<ticker>?interval=&range=   Yahoo chart replies
 *   /yahoo/down/...                                         HTTP 503 (provider outage)
 *   /angel/badauth/rest/auth/...                            Angel One refusing the sign-in
 */
import http from "node:http";

const IST = 330 * 60_000;

function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
function rng(seed) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The most recent weekday session (09:15–15:30 IST) that has started, as UTC ms bounds. */
function lastSession(now = Date.now()) {
  for (let back = 0; back < 7; back++) {
    const d = new Date(now + IST - back * 86_400_000);
    const day = d.getUTCDay();
    if (day === 0 || day === 6) continue;
    const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - IST;
    const open = midnight + (9 * 60 + 15) * 60_000;
    const close = midnight + (15 * 60 + 30) * 60_000;
    if (open > now) continue;
    return { open, close: Math.min(close, now) };
  }
  throw new Error("no session");
}

function chart(ticker, interval, range) {
  const r = rng(hash(ticker + interval + range));
  const isIndex = ticker.startsWith("^");
  const base = isIndex ? 20000 + (hash(ticker) % 60000) : 100 + (hash(ticker) % 3000);
  const step = { "5m": 300, "15m": 900, "1d": 86400, "1wk": 604800 }[interval] ?? 86400;
  const count = { "1d": 0, "5d": 125, "1mo": 22, "3mo": 64, "6mo": 126, "1y": 250, "5y": 260 }[range] ?? 22;
  const ts = [];
  if (range === "1d") {
    const s = lastSession();
    for (let t = s.open; t <= s.close; t += 300_000) ts.push(Math.floor(t / 1000));
  } else {
    const end = Math.floor(lastSession().close / 1000);
    for (let i = count - 1; i >= 0; i--) ts.push(end - i * step);
  }
  let p = base;
  const o = [], h = [], l = [], c = [], v = [];
  for (let i = 0; i < ts.length; i++) {
    const open = p;
    p = Math.max(1, p * (1 + (r() - 0.49) * (interval === "5m" ? 0.004 : 0.02)));
    o.push(+open.toFixed(2));
    c.push(+p.toFixed(2));
    h.push(+(Math.max(open, p) * (1 + r() * 0.003)).toFixed(2));
    l.push(+(Math.min(open, p) * (1 - r() * 0.003)).toFixed(2));
    v.push(isIndex ? null : Math.round(1000 + r() * 200000));
  }
  const prev = +(base * (1 + (r() - 0.5) * 0.02)).toFixed(2);
  return {
    chart: {
      result: [{
        meta: {
          currency: "INR", symbol: ticker, regularMarketPrice: c[c.length - 1], previousClose: prev, chartPreviousClose: prev,
          regularMarketTime: ts[ts.length - 1], regularMarketDayHigh: Math.max(...h.slice(-75)), regularMarketDayLow: Math.min(...l.slice(-75)),
          regularMarketVolume: isIndex ? 0 : v.slice(-75).reduce((a, b) => a + b, 0),
        },
        timestamp: ts,
        indicators: { quote: [{ open: o, high: h, low: l, close: c, volume: v }] },
      }],
      error: null,
    },
  };
}

export function startMock(port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    if (url.pathname.startsWith("/yahoo/down/")) return send(503, "Service Unavailable");
    const m = /^\/yahoo\/ok\/v8\/finance\/chart\/(.+)$/.exec(url.pathname);
    if (m) {
      const ticker = decodeURIComponent(m[1]);
      if (ticker.startsWith("NOTFOUND")) return send(404, { chart: { result: null, error: { code: "Not Found", description: "No data found, symbol may be delisted" } } });
      return send(200, chart(ticker, url.searchParams.get("interval") ?? "1d", url.searchParams.get("range") ?? "1mo"));
    }
    if (url.pathname.startsWith("/angel/badauth/")) return send(200, { status: false, message: "Invalid totp", errorcode: "AB1050", data: null });
    send(404, { error: "unknown fixture path" });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}

if (process.argv[1] && process.argv[1].endsWith("mock-upstream.mjs")) {
  const { port } = await startMock(Number(process.env.PORT || 0));
  console.log(`mock upstream on http://127.0.0.1:${port}`);
}
