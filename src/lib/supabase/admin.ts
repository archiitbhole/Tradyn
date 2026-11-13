import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./config";

let client: SupabaseClient | null | undefined;

/** Service-role client for server-side housekeeping (broker session tokens). Null when not configured. */
export function adminClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const { url, serviceKey } = supabaseEnv();
  client = url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return client;
}
