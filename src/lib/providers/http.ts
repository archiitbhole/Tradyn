import "server-only";
import type { ProviderId } from "@/types/market";
import { ProviderError } from "./errors";

export interface HttpReply {
  status: number;
  data: unknown;
}

interface Options {
  provider: ProviderId;
  label: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  query?: Record<string, string | number>;
  body?: unknown;
  timeoutMs?: number;
}

/**
 * One bounded JSON request to a data provider. Every call has a timeout, so a slow provider can
 * never keep a serverless function running. Network failures and non-JSON replies become a
 * ProviderError whose text names the provider only — never the URL query, headers or body.
 */
export async function fetchJson(url: string, o: Options): Promise<HttpReply> {
  const u = new URL(url);
  for (const [k, v] of Object.entries(o.query ?? {})) u.searchParams.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(u, {
      method: o.method ?? "GET",
      headers: o.headers,
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
      signal: AbortSignal.timeout(o.timeoutMs ?? 8000),
      cache: "no-store",
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new ProviderError("PROVIDER_UNREACHABLE", timedOut ? `${o.label} did not answer in time.` : `${o.label} could not be reached.`, { provider: o.provider });
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (res.status === 429) throw new ProviderError("RATE_LIMITED", `${o.label} is limiting requests right now. Try again in a minute.`, { provider: o.provider });
      throw new ProviderError("PROVIDER_ERROR", `${o.label} sent an unexpected reply (HTTP ${res.status}).`, { provider: o.provider });
    }
  }
  if (res.status === 429) throw new ProviderError("RATE_LIMITED", `${o.label} is limiting requests right now. Try again in a minute.`, { provider: o.provider });
  if (res.status >= 500) throw new ProviderError("PROVIDER_ERROR", `${o.label} is having problems (HTTP ${res.status}).`, { provider: o.provider });
  return { status: res.status, data };
}
