import "server-only";
import type { ProviderId } from "@/types/market";
import { adminClient } from "@/lib/supabase/admin";

interface Saved {
  token: string;
  expires: number;
}

const memory = new Map<ProviderId, Saved>();

/**
 * Broker session tokens. They are kept in memory for the life of a function instance, and — when
 * SUPABASE_SERVICE_ROLE_KEY is set — also in the `provider_sessions` table (no access for normal
 * users), so new instances reuse a login instead of signing in to the broker again.
 */
export async function loadToken(provider: ProviderId, now = Date.now()): Promise<string | null> {
  const m = memory.get(provider);
  if (m && m.expires > now) return m.token;
  const db = adminClient();
  if (!db) return null;
  try {
    const { data } = await db.from("provider_sessions").select("token, expires_at").eq("provider", provider).maybeSingle();
    const expires = data ? Date.parse(String(data.expires_at)) : 0;
    if (data?.token && expires > now) {
      memory.set(provider, { token: String(data.token), expires });
      return String(data.token);
    }
  } catch {
    // the table is optional; without it every instance signs in for itself
  }
  return null;
}

export async function saveToken(provider: ProviderId, token: string, ttlMs: number, now = Date.now()): Promise<void> {
  const expires = now + ttlMs;
  memory.set(provider, { token, expires });
  const db = adminClient();
  if (!db) return;
  try {
    await db.from("provider_sessions").upsert({ provider, token, expires_at: new Date(expires).toISOString() });
  } catch {
    // optional
  }
}

export async function clearToken(provider: ProviderId): Promise<void> {
  memory.delete(provider);
  const db = adminClient();
  if (!db) return;
  try {
    await db.from("provider_sessions").delete().eq("provider", provider);
  } catch {
    // optional
  }
}

export function clearTokenMemory(): void {
  memory.clear();
}
