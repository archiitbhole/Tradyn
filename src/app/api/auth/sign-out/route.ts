import type { NextRequest } from "next/server";
import { guarded, ok } from "@/lib/api/respond";
import { userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export function POST(req: NextRequest) {
  return guarded(req, { route: "POST /api/auth/sign-out", bucket: "auth", limit: 20, sameOrigin: true }, async () => {
    const db = await userClient();
    if (db) await db.auth.signOut();
    return ok({ signedOut: true });
  });
}
