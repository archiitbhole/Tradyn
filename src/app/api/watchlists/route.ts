import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fail, guarded, jsonBody, ok } from "@/lib/api/respond";
import { params, watchlistCreate, watchlistDelete, watchlistUpdate } from "@/lib/api/schemas";
import { getInstrument } from "@/lib/market-data/universe";
import { ProviderError } from "@/lib/providers/errors";
import { supabaseEnv } from "@/lib/supabase/config";
import { currentUser } from "@/lib/supabase/server";
import type { Watchlist, WatchlistItem } from "@/types/market";

export const dynamic = "force-dynamic";

const MAX_LISTS = 20;
const MAX_ITEMS = 100;

/** Every watchlist route needs a signed-in user; Row Level Security then limits each query to that user's rows. */
async function signedIn(): Promise<{ db: SupabaseClient; userId: string }> {
  const env = supabaseEnv();
  if (!env.configured) throw new ProviderError("NOT_CONFIGURED", "Accounts are not set up on this deployment, so watchlists are kept on this device.", { missing: env.missing });
  const { db, user } = await currentUser();
  if (!db || !user) throw new ProviderError("UNAUTHENTICATED", "Sign in to use watchlists saved to your account.");
  return { db, userId: user.id };
}

function toItem(key: string): WatchlistItem {
  const ins = getInstrument(key);
  const [exchange, symbol] = [key.slice(0, 3), key.slice(4)];
  return ins
    ? { key, symbol: ins.symbol, name: ins.name, exchange: ins.exchange, kind: ins.kind }
    : { key, symbol, name: "No longer in the instrument list", exchange: exchange === "BSE" ? "BSE" : "NSE", kind: "EQ" };
}

function dbFail(message: string): never {
  // PostgREST messages can include table details; the user gets a plain sentence instead.
  throw new ProviderError("INTERNAL", message.includes("relation") ? "The watchlist tables are missing. Run supabase/schema.sql in your Supabase project." : "The watchlist could not be saved. Please try again.");
}

async function load(db: SupabaseClient): Promise<Watchlist[]> {
  const { data, error } = await db.from("watchlists").select("id, name, created_at, watchlist_items(instrument_key, added_at)").order("created_at", { ascending: true });
  if (error) dbFail(error.message);
  return (data ?? []).map((w) => ({
    id: String(w.id), name: String(w.name),
    items: [...(w.watchlist_items ?? [])].sort((a, b) => String(a.added_at).localeCompare(String(b.added_at))).map((i) => toItem(String(i.instrument_key))),
  }));
}

/** GET /api/watchlists — the signed-in user's watchlists with their shares. */
export function GET(req: NextRequest) {
  return guarded(req, { route: "GET /api/watchlists", bucket: "user" }, async () => {
    const { db } = await signedIn();
    return ok(await load(db));
  });
}

/** POST /api/watchlists { name } — create a watchlist. */
export function POST(req: NextRequest) {
  return guarded(req, { route: "POST /api/watchlists", bucket: "user", limit: 40, sameOrigin: true }, async () => {
    const body = watchlistCreate.parse(await jsonBody(req));
    const { db, userId } = await signedIn();
    const { count } = await db.from("watchlists").select("id", { count: "exact", head: true });
    if ((count ?? 0) >= MAX_LISTS) return fail({ code: "BAD_REQUEST", message: `You can have up to ${MAX_LISTS} watchlists.` });
    const { error } = await db.from("watchlists").insert({ name: body.name, user_id: userId });
    if (error) dbFail(error.message);
    return ok(await load(db), { status: 201 });
  });
}

/** PUT /api/watchlists { id, name } | { id, add } | { id, remove } — rename, add a share or remove a share. */
export function PUT(req: NextRequest) {
  return guarded(req, { route: "PUT /api/watchlists", bucket: "user", limit: 80, sameOrigin: true }, async () => {
    const body = watchlistUpdate.parse(await jsonBody(req));
    const { db } = await signedIn();
    const { data: list, error: findError } = await db.from("watchlists").select("id").eq("id", body.id).maybeSingle();
    if (findError) dbFail(findError.message);
    if (!list) return fail({ code: "NOT_FOUND", message: "That watchlist does not exist." });
    if (body.name !== undefined) {
      const { error } = await db.from("watchlists").update({ name: body.name }).eq("id", body.id);
      if (error) dbFail(error.message);
    } else if (body.add !== undefined) {
      if (!getInstrument(body.add)) return fail({ code: "NOT_FOUND", message: `${body.add} is not a share or index Tradyn knows.` });
      const { count } = await db.from("watchlist_items").select("instrument_key", { count: "exact", head: true }).eq("watchlist_id", body.id);
      if ((count ?? 0) >= MAX_ITEMS) return fail({ code: "BAD_REQUEST", message: `A watchlist can hold up to ${MAX_ITEMS} shares.` });
      const { error } = await db.from("watchlist_items").upsert({ watchlist_id: body.id, instrument_key: body.add }, { onConflict: "watchlist_id,instrument_key", ignoreDuplicates: true });
      if (error) dbFail(error.message);
    } else if (body.remove !== undefined) {
      const { error } = await db.from("watchlist_items").delete().eq("watchlist_id", body.id).eq("instrument_key", body.remove);
      if (error) dbFail(error.message);
    }
    return ok(await load(db));
  });
}

/** DELETE /api/watchlists?id= — delete a watchlist and everything in it. */
export function DELETE(req: NextRequest) {
  return guarded(req, { route: "DELETE /api/watchlists", bucket: "user", limit: 40, sameOrigin: true }, async () => {
    const q = watchlistDelete.parse(params(req.url));
    const { db } = await signedIn();
    const { data, error } = await db.from("watchlists").delete().eq("id", q.id).select("id");
    if (error) dbFail(error.message);
    if (!data?.length) return fail({ code: "NOT_FOUND", message: "That watchlist does not exist." });
    return ok(await load(db));
  });
}
