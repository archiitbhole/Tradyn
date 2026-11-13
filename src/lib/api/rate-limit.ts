import "server-only";

interface Window {
  start: number;
  count: number;
}

const windows = new Map<string, Window>();

/**
 * Fixed-window request limit per client and bucket. It lives in the memory of one function
 * instance, so on Vercel it is a per-instance brake (good enough to stop a runaway page or a
 * simple script); the CDN cache in front of the data routes absorbs the rest.
 */
export function rateLimit(client: string, bucket: string, limit: number, windowMs = 60_000, now = Date.now()): { ok: boolean; retryAfter: number; remaining: number } {
  const key = bucket + "|" + client;
  let w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    w = { start: now, count: 0 };
    windows.set(key, w);
    if (windows.size > 5000) for (const [k, v] of windows) if (now - v.start >= windowMs) windows.delete(k);
  }
  w.count++;
  return { ok: w.count <= limit, retryAfter: Math.max(1, Math.ceil((w.start + windowMs - now) / 1000)), remaining: Math.max(0, limit - w.count) };
}

export function resetRateLimits(): void {
  windows.clear();
}

export function clientId(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
}
