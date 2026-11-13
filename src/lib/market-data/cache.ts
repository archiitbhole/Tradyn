import "server-only";

interface Entry {
  expires: number;
  value?: unknown;
  pending?: Promise<unknown>;
}

/**
 * Small per-instance cache. On Vercel each function instance has its own copy and it disappears
 * when the instance is recycled — that is fine: it only saves repeat calls to the provider within
 * a few seconds. Sharing between instances is done by the CDN (Cache-Control: s-maxage on replies).
 */
const store = new Map<string, Entry>();
const MAX = 4000;

function prune(now: number) {
  if (store.size < MAX) return;
  for (const [k, e] of store) if (e.expires <= now && !e.pending) store.delete(k);
  if (store.size >= MAX) for (const k of Array.from(store.keys()).slice(0, MAX / 4)) store.delete(k);
}

export function cacheGet<T>(key: string, now = Date.now()): T | undefined {
  const e = store.get(key);
  return e && e.value !== undefined && e.expires > now ? (e.value as T) : undefined;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number, now = Date.now()): void {
  prune(now);
  store.set(key, { value, expires: now + ttlMs });
}

/** Returns the cached value, or runs `load` once (concurrent callers share the same call). Errors are not cached. */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit) {
    if (hit.value !== undefined && hit.expires > now) return hit.value as T;
    if (hit.pending) return hit.pending as Promise<T>;
  }
  prune(now);
  const pending = load().then(
    (value) => {
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    },
    (err) => {
      store.delete(key);
      throw err;
    },
  );
  store.set(key, { expires: 0, pending });
  return pending;
}

export function cacheClear(prefix = ""): void {
  for (const k of Array.from(store.keys())) if (k.startsWith(prefix)) store.delete(k);
}
