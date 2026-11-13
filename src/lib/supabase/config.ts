import "server-only";

/** Supabase settings. Read on the server only; nothing here is ever sent to the browser. */
export function supabaseEnv() {
  const url = process.env.SUPABASE_URL?.trim() || "";
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim() || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  const missing = [!url && "SUPABASE_URL", !anonKey && "SUPABASE_ANON_KEY"].filter(Boolean) as string[];
  return { url, anonKey, serviceKey, configured: missing.length === 0, missing };
}
