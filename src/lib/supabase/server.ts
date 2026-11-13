import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./config";

/**
 * Supabase client for the signed-in visitor. The session lives in httpOnly cookies set by this
 * app's own routes, so the browser never holds a Supabase key or talks to Supabase directly.
 * Row Level Security in the database limits every query to the visitor's own rows.
 */
export async function userClient() {
  const { url, anonKey, configured } = supabaseEnv();
  if (!configured) return null;
  const jar = await cookies();
  return createServerClient(url, anonKey, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, { ...options, httpOnly: true });
        } catch {
          // called from a Server Component: cookies are read-only there, the next route call refreshes them
        }
      },
    },
  });
}

export async function currentUser() {
  const db = await userClient();
  if (!db) return { db: null, user: null };
  const { data } = await db.auth.getUser();
  return { db, user: data.user ?? null };
}
