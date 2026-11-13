import type { NextRequest } from "next/server";
import { fail, guarded, jsonBody, ok } from "@/lib/api/respond";
import { credentials } from "@/lib/api/schemas";
import { supabaseEnv } from "@/lib/supabase/config";
import { userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** POST /api/auth/sign-in { email, password } — the session is stored in httpOnly cookies. */
export function POST(req: NextRequest) {
  return guarded(req, { route: "POST /api/auth/sign-in", bucket: "auth", limit: 10, sameOrigin: true }, async () => {
    const body = credentials.parse(await jsonBody(req));
    const db = await userClient();
    if (!db) return fail({ code: "NOT_CONFIGURED", message: "Accounts are not set up on this deployment.", missing: supabaseEnv().missing });
    const { data, error } = await db.auth.signInWithPassword(body);
    if (error || !data.user) return fail({ code: "UNAUTHENTICATED", message: error?.message === "Email not confirmed" ? "Confirm your email first — open the link we sent you." : "Email or password is not correct." });
    return ok({ user: { id: data.user.id, email: data.user.email ?? "" } });
  });
}
