import "server-only";
import type { Candle, HistoryRange, Instrument, Quote } from "@/types/market";
import { cached } from "@/lib/market-data/cache";
import { istStamp, parseAngelFeedTime } from "@/lib/market-data/time";
import { indexDef } from "@/lib/market-data/universe";
import { chunk, mapLimit } from "@/lib/utils/async";
import { arr, num, rec, str, type Rec } from "@/lib/utils/safe";
import { BaseProvider } from "./base";
import { env, missing } from "./env";
import { ProviderError } from "./errors";
import { fetchJson } from "./http";
import { clearToken, loadToken, saveToken } from "./token-store";
import { totp } from "./totp";
import type { QuoteBatch } from "./types";

/**
 * Angel One SmartAPI — official broker API. Read-only market data: login, quote, candles and
 * symbol lookup. Never places orders, never reads holdings or funds.
 * Routes and headers follow Angel One's published SmartAPI documentation.
 */
const ROOT = "https://apiconnect.angelbroking.com";
const ROUTES = {
  login: "/rest/auth/angelbroking/user/v1/loginByPassword",
  search: "/rest/secure/angelbroking/order/v1/searchScrip",
  quote: "/rest/secure/angelbroking/market/v1/quote",
  candles: "/rest/secure/angelbroking/historical/v1/getCandleData",
} as const;
const REQUIRED = ["ANGEL_API_KEY", "ANGEL_CLIENT_CODE", "ANGEL_MPIN", "ANGEL_TOTP_SECRET"];
const SESSION_EXPIRED = new Set(["AG8001", "AG8002", "AG8003", "AB1010", "AB1011"]);
const DAY = 86_400_000;

// range -> candle size and how far back to ask (within Angel One's per-request limits)
const PLAN: Record<HistoryRange, { interval: string; label: string; days: number; intraday: boolean }> = {
  "1D": { interval: "FIVE_MINUTE", label: "5 min", days: 6, intraday: true },
  "1W": { interval: "FIFTEEN_MINUTE", label: "15 min", days: 9, intraday: true },
  "1M": { interval: "ONE_DAY", label: "1 day", days: 31, intraday: false },
  "3M": { interval: "ONE_DAY", label: "1 day", days: 92, intraday: false },
  "6M": { interval: "ONE_DAY", label: "1 day", days: 183, intraday: false },
  "1Y": { interval: "ONE_DAY", label: "1 day", days: 366, intraday: false },
  "5Y": { interval: "ONE_DAY", label: "1 day", days: 1826, intraday: false },
};

export class AngelOneProvider extends BaseProvider {
  readonly id = "angelone" as const;
  readonly name = "Angel One SmartAPI";
  readonly official = true;
  readonly delayed = false;
  readonly note = "Official broker API. Needs your own Angel One account and a SmartAPI key.";
  readonly moversLimit = 200;
  private login: Promise<string> | null = null;

  missingEnv(): string[] {
    return missing(REQUIRED);
  }

  private root(): string {
    return env("ANGEL_API_ROOT") || ROOT;
  }

  private headers(jwt?: string): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json", Accept: "application/json",
      "X-UserType": "USER", "X-SourceID": "WEB",
      "X-ClientLocalIP": env("ANGEL_LOCAL_IP") || "127.0.0.1",
      "X-ClientPublicIP": env("ANGEL_PUBLIC_IP") || "127.0.0.1",
      "X-MACAddress": env("ANGEL_MAC_ADDRESS") || "02:00:00:00:00:01",
      "X-PrivateKey": env("ANGEL_API_KEY"),
    };
    if (jwt) h.Authorization = "Bearer " + jwt;
    return h;
  }

  private async signIn(): Promise<string> {
    this.ensureConfigured();
    let code: string;
    try {
      code = totp(env("ANGEL_TOTP_SECRET"));
    } catch {
      throw new ProviderError("AUTH_FAILED", "ANGEL_TOTP_SECRET is not a valid authenticator secret (it should be the base32 text behind the QR code).", { provider: this.id });
    }
    const { data } = await fetchJson(this.root() + ROUTES.login, {
      provider: this.id, label: this.name, method: "POST", headers: this.headers(),
      body: { clientcode: env("ANGEL_CLIENT_CODE"), password: env("ANGEL_MPIN"), totp: code },
    });
    const d = rec(data);
    const jwt = str(rec(d.data).jwtToken);
    if (!d.status || !jwt) {
      throw new ProviderError("AUTH_FAILED", `Angel One sign-in was refused: ${str(d.message) || str(d.errorcode) || "no reason given"}. Check the four ANGEL_ settings.`, { provider: this.id });
    }
    await saveToken(this.id, jwt, 8 * 3600_000);
    return jwt;
  }

  private async token(fresh = false): Promise<string> {
    if (!fresh) {
      const saved = await loadToken(this.id);
      if (saved) return saved;
    }
    // concurrent requests share one sign-in (Angel One allows about one login per second)
    this.login ??= this.signIn().finally(() => {
      this.login = null;
    });
    return this.login;
  }

  private async post(route: keyof typeof ROUTES, body: unknown, retry = true): Promise<Rec> {
    this.ensureConfigured();
    const jwt = await this.token();
    const { status, data } = await fetchJson(this.root() + ROUTES[route], { provider: this.id, label: this.name, method: "POST", headers: this.headers(jwt), body });
    const d = rec(data);
    const code = str(d.errorcode) || str(d.errorCode);
    const expired = status === 401 || status === 403 || SESSION_EXPIRED.has(code);
    if (expired && retry) {
      await clearToken(this.id);
      await this.token(true); // session expired -> sign in again once
      return this.post(route, body, false);
    }
    if (expired) throw new ProviderError("AUTH_FAILED", `Angel One rejected the session: ${str(d.message) || code || "HTTP " + status}.`, { provider: this.id });
    if (d.status === false || status >= 400) {
      throw new ProviderError("PROVIDER_ERROR", `Angel One: ${str(d.message) || code || "request failed (HTTP " + status + ")"}.`, { provider: this.id });
    }
    return d;
  }

  /** Exchange segment and token for an instrument. Tokens come from the synced instrument list; a lookup call is the fallback. */
  private async tokenOf(ins: Instrument): Promise<{ exchange: string; token: string }> {
    if (ins.token) return { exchange: ins.exchange, token: ins.token };
    if (ins.kind === "INDEX") {
      const t = indexDef(ins.symbol)?.angelToken;
      if (t) return { exchange: ins.exchange, token: t };
      throw new ProviderError("NOT_FOUND", `Angel One: ${ins.symbol} is not available until the instrument list has been synced.`, { provider: this.id });
    }
    const token = await cached(`angel:token:${ins.key}`, 12 * 3600_000, async () => {
      const d = await this.post("search", { exchange: ins.exchange, searchscrip: ins.symbol });
      const want = ins.exchange === "NSE" ? ins.symbol + "-EQ" : ins.symbol;
      const row = arr(d.data).map(rec).find((r) => str(r.tradingsymbol) === want);
      if (!row) throw new ProviderError("NOT_FOUND", `Angel One: ${ins.symbol} was not found on ${ins.exchange}.`, { provider: this.id });
      return str(row.symboltoken);
    });
    return { exchange: ins.exchange, token };
  }

  protected async fetchQuotes(instruments: Instrument[]): Promise<QuoteBatch> {
    const errors: string[] = [];
    const byToken = new Map<string, Instrument>();
    const pairs: { exchange: string; token: string }[] = [];
    await mapLimit(instruments, 2, async (ins) => {
      try {
        const t = await this.tokenOf(ins);
        byToken.set(`${t.exchange}:${t.token}`, ins);
        pairs.push(t);
      } catch (e) {
        if (e instanceof ProviderError && e.code === "NOT_FOUND") errors.push(e.message);
        else throw e;
      }
    });
    const quotes: Quote[] = [];
    // the quote endpoint accepts up to 50 tokens per request
    const replies = await mapLimit(chunk(pairs, 50), 2, (group) => {
      const exchangeTokens: Record<string, string[]> = {};
      for (const p of group) (exchangeTokens[p.exchange] ??= []).push(p.token);
      return this.post("quote", { mode: "FULL", exchangeTokens });
    });
    for (const d of replies) {
      for (const row of arr(rec(d.data).fetched).map(rec)) {
        const ins = byToken.get(`${str(row.exchange)}:${str(row.symbolToken)}`);
        const price = num(row.ltp);
        if (!ins || price == null || price <= 0) continue;
        quotes.push(this.quote(ins, {
          price, prevClose: num(row.close), open: num(row.open), high: num(row.high), low: num(row.low),
          volume: num(row.tradeVolume), ts: parseAngelFeedTime(str(row.exchFeedTime)),
        }));
      }
    }
    return { quotes, errors };
  }

  protected async fetchCandles(ins: Instrument, range: HistoryRange) {
    const plan = PLAN[range];
    const { exchange, token } = await this.tokenOf(ins);
    const now = Date.now();
    const d = await this.post("candles", {
      exchange, symboltoken: token, interval: plan.interval,
      fromdate: istStamp(now - plan.days * DAY).slice(0, 10) + " 09:00", todate: istStamp(now),
    });
    const candles: Candle[] = [];
    for (const row of arr(d.data)) {
      const r = arr(row);
      const t = Date.parse(str(r[0]));
      const [o, h, l, c] = [num(r[1]), num(r[2]), num(r[3]), num(r[4])];
      if (!Number.isFinite(t) || o == null || h == null || l == null || c == null) continue;
      candles.push({ time: t / 1000, open: o, high: h, low: l, close: c, volume: ins.kind === "INDEX" ? null : num(r[5]) });
    }
    return { candles, interval: plan.label, intraday: plan.intraday };
  }
}
