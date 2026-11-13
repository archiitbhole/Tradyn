import type { NextRequest } from "next/server";
import { fail, guarded, jsonBody, ok } from "@/lib/api/respond";
import { credentials } from "@/lib/api/schemas";
import { supabaseEnv } from "@/lib/supabase/config";
import { userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** POST /api/auth/sign-up { email, password } — the session is stored in httpOnly cookies. */
export function POST(req: NextRequest) {
  return guarded(req, { route: "POST /api/auth/sign-up", bucket: "auth", limit: 10, sameOrigin: true }, async () => {
    const body = credentials.parse(await jsonBody(req));
    const db = await userClient();
    if (!db) return fail({ code: "NOT_CONFIGURED", message: "Accounts are not set up on this deployment.", missing: supabaseEnv().missing });
    const origin = `${req.headers.get("x-forwarded-proto") ?? "http"}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host")}`;
    const { data, error } = await db.auth.signUp({ ...body, options: { emailRedirectTo: origin + "/auth/callback" } });
    if (error) return fail({ code: "BAD_REQUEST", message: error.message });
    // With email confirmation switched on in Supabase there is no session yet.
    return ok({ user: data.session && data.user ? { id: data.user.id, email: data.user.email ?? "" } : null, confirmEmail: !data.session });
  });
}
