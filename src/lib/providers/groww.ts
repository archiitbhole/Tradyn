import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Candle, HistoryRange, Instrument, Quote } from "@/types/market";
import { istStamp, parseIstLoose } from "@/lib/market-data/time";
import { indexDef } from "@/lib/market-data/universe";
import { mapLimit } from "@/lib/utils/async";
import { arr, num, rec, str, type Rec } from "@/lib/utils/safe";
import { BaseProvider } from "./base";
import { env } from "./env";
import { ProviderError } from "./errors";
import { fetchJson } from "./http";
import { clearToken, loadToken, saveToken } from "./token-store";
import { totp } from "./totp";
import type { QuoteBatch } from "./types";

/**
 * Groww Trade API — official broker API (needs a Groww account with a Trading API subscription).
 * Read-only: live quotes and historical candles. No orders, no holdings.
 * Sign-in, in order of preference:
 *   GROWW_ACCESS_TOKEN                   a token you generated yourself (expires every morning)
 *   GROWW_API_KEY + GROWW_TOTP_SECRET    TOTP key — renews itself, best for an unattended deployment
 *   GROWW_API_KEY + GROWW_API_SECRET     "approval" key — must be approved daily on Groww Cloud
 */
const ROOT = "https://api.groww.in/v1";
const DAY = 86_400_000;

const PLAN: Record<HistoryRange, { minutes: number; label: string; days: number; intraday: boolean }> = {
  "1D": { minutes: 5, label: "5 min", days: 6, intraday: true },
  "1W": { minutes: 10, label: "10 min", days: 9, intraday: true },
  "1M": { minutes: 1440, label: "1 day", days: 31, intraday: false },
  "3M": { minutes: 1440, label: "1 day", days: 92, intraday: false },
  "6M": { minutes: 1440, label: "1 day", days: 183, intraday: false },
  "1Y": { minutes: 1440, label: "1 day", days: 366, intraday: false },
  "5Y": { minutes: 10080, label: "1 week", days: 1826, intraday: false },
};

/** Groww sends OHLC either as an object or as text like "{open: 149.5,high: 150.5,low: 148.5,close: 149.5}". */
export function parseOhlc(v: unknown): { open: number | null; high: number | null; low: number | null; close: number | null } {
  const out = { open: null as number | null, high: null as number | null, low: null as number | null, close: null as number | null };
  if (typeof v === "string") {
    for (const m of v.matchAll(/(open|high|low|close)\s*:\s*(-?[\d.]+)/g)) out[m[1] as keyof typeof out] = num(m[2]);
  } else {
    const r = rec(v);
    for (const k of ["open", "high", "low", "close"] as const) out[k] = num(r[k]);
  }
  return out;
}

export class GrowwProvider extends BaseProvider {
  readonly id = "groww" as const;
  readonly name = "Groww Trade API";
  readonly official = true;
  readonly delayed = false;
  readonly note = "Official broker API. Needs a Groww account with a Trading API subscription.";
  // one request per share for a full quote, and Groww allows about ten a second
  readonly moversLimit = 40;
  private login: Promise<string> | null = null;

  missingEnv(): string[] {
    if (env("GROWW_ACCESS_TOKEN")) return [];
    if (env("GROWW_API_KEY") && (env("GROWW_TOTP_SECRET") || env("GROWW_API_SECRET"))) return [];
    return env("GROWW_API_KEY") ? ["GROWW_API_SECRET or GROWW_TOTP_SECRET"] : ["GROWW_API_KEY", "GROWW_API_SECRET or GROWW_TOTP_SECRET"];
  }

  private headers(bearer: string): Record<string, string> {
    return { Authorization: "Bearer " + bearer, Accept: "application/json", "Content-Type": "application/json", "X-API-VERSION": "1.0", "x-request-id": randomUUID() };
  }

  private root(): string {
    return env("GROWW_API_ROOT") || ROOT;
  }

  private async signIn(): Promise<string> {
    let body: Rec;
    if (env("GROWW_TOTP_SECRET")) {
      try {
        body = { key_type: "totp", totp: totp(env("GROWW_TOTP_SECRET")) };
      } catch {
        throw new ProviderError("AUTH_FAILED", "GROWW_TOTP_SECRET is not a valid authenticator secret.", { provider: this.id });
      }
    } else {
      const ts = Math.floor(Date.now() / 1000);
      body = { key_type: "approval", checksum: createHash("sha256").update(env("GROWW_API_SECRET") + ts).digest("hex"), timestamp: ts };
    }
    const { status, data } = await fetchJson(this.root() + "/token/api/access", { provider: this.id, label: this.name, method: "POST", headers: this.headers(env("GROWW_API_KEY")), body });
    const d = rec(data);
    const token = str(d.token) || str(rec(d.payload).token);
    if (!token) {
      const err = rec(d.error);
      throw new ProviderError("AUTH_FAILED", `Groww sign-in was refused: ${str(err.displayMessage) || str(err.message) || "HTTP " + status}. ` +
        (env("GROWW_TOTP_SECRET") ? "Check GROWW_API_KEY and GROWW_TOTP_SECRET." : "An approval key must be approved on Groww Cloud every day."), { provider: this.id });
    }
    // Groww tokens stop working at 6:00 in the morning India time
    const now = Date.now();
    const sixAm = Date.parse(istStamp(now).slice(0, 10) + "T06:00:00+05:30");
    await saveToken(this.id, token, Math.max(5 * 60_000, (sixAm > now ? sixAm : sixAm + DAY) - now - 60_000));
    return token;
  }

  private async token(fresh = false): Promise<string> {
    const direct = env("GROWW_ACCESS_TOKEN");
    if (direct) return direct;
    if (!fresh) {
      const saved = await loadToken(this.id);
      if (saved) return saved;
    }
    this.login ??= this.signIn().finally(() => {
      this.login = null;
    });
    return this.login;
  }

  private async get(path: string, query: Record<string, string | number>, retry = true): Promise<Rec> {
    this.ensureConfigured();
    const bearer = await this.token();
    const { status, data } = await fetchJson(this.root() + path, { provider: this.id, label: this.name, headers: this.headers(bearer), query });
    const d = rec(data);
    if (status === 401 || status === 403) {
      if (env("GROWW_ACCESS_TOKEN")) {
        throw new ProviderError("AUTH_FAILED", "Groww rejected GROWW_ACCESS_TOKEN. These tokens expire every morning — generate a new one, or switch to GROWW_API_KEY with GROWW_TOTP_SECRET.", { provider: this.id });
      }
      await clearToken(this.id);
      if (retry) {
        await this.token(true);
        return this.get(path, query, false);
      }
      throw new ProviderError("AUTH_FAILED", "Groww rejected the session after signing in again.", { provider: this.id });
    }
    if (d.status === "FAILURE" || status >= 400) {
      const err = rec(d.error);
      const msg = str(err.message) || str(err.displayMessage) || "HTTP " + status;
      throw new ProviderError(status === 404 ? "NOT_FOUND" : "PROVIDER_ERROR", `Groww: ${msg}.`, { provider: this.id });
    }
    return "payload" in d ? rec(d.payload) : d;
  }

  private symbol(ins: Instrument): string | null {
    if (ins.kind !== "INDEX") return ins.symbol;
    return indexDef(ins.symbol)?.groww ?? null;
  }

  protected async fetchQuotes(instruments: Instrument[]): Promise<QuoteBatch> {
    const errors: string[] = [];
    let fatal: ProviderError | null = null;
    const rows = await mapLimit(instruments, 5, async (ins): Promise<Quote | null> => {
      const sym = this.symbol(ins);
      if (!sym) {
        errors.push(`Groww does not provide ${ins.symbol}.`);
        return null;
      }
      if (fatal) return null;
      try {
        const p = await this.get("/live-data/quote", { exchange: ins.exchange, segment: "CASH", trading_symbol: sym });
        const price = num(p.last_price);
        if (price == null || price <= 0) return null;
        const ohlc = parseOhlc(p.ohlc);
        const change = num(p.day_change);
        const ltt = num(p.last_trade_time);
        return this.quote(ins, {
          price, prevClose: change != null ? price - change : ohlc.close, open: ohlc.open, high: ohlc.high, low: ohlc.low,
          volume: num(p.volume), ts: ltt == null ? null : ltt > 1e11 ? ltt : ltt * 1000,
        });
      } catch (e) {
        if (e instanceof ProviderError && (e.code === "NOT_FOUND" || e.code === "PROVIDER_ERROR")) {
          errors.push(`${ins.symbol}: ${e.message}`);
          return null;
        }
        fatal = e instanceof ProviderError ? e : new ProviderError("PROVIDER_ERROR", "Groww request failed.", { provider: this.id });
        return null;
      }
    });
    const quotes = rows.filter((q): q is Quote => !!q);
    if (fatal && !quotes.length) throw fatal;
    return { quotes, errors };
  }

  protected async fetchCandles(ins: Instrument, range: HistoryRange) {
    const plan = PLAN[range];
    const sym = this.symbol(ins);
    if (!sym) throw new ProviderError("NOT_FOUND", `Groww does not provide ${ins.symbol}.`, { provider: this.id });
    const now = Date.now();
    const p = await this.get("/historical/candle/range", {
      exchange: ins.exchange, segment: "CASH", trading_symbol: sym,
      start_time: istStamp(now - plan.days * DAY).slice(0, 10) + " 09:00:00", end_time: istStamp(now, true),
      interval_in_minutes: plan.minutes,
    });
    const candles: Candle[] = [];
    for (const row of arr(p.candles)) {
      const r = arr(row);
      const raw = r[0];
      const n = num(raw);
      const ms = n != null ? (n > 1e11 ? n : n * 1000) : parseIstLoose(str(raw));
      const [o, h, l, c] = [num(r[1]), num(r[2]), num(r[3]), num(r[4])];
      if (ms == null || o == null || h == null || l == null || c == null) continue;
      candles.push({ time: ms / 1000, open: o, high: h, low: l, close: c, volume: ins.kind === "INDEX" ? null : num(r[5]) });
    }
    return { candles, interval: plan.label, intraday: plan.intraday };
  }
}
