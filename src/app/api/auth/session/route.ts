import type { NextRequest } from "next/server";
import { guarded, ok } from "@/lib/api/respond";
import { supabaseEnv } from "@/lib/supabase/config";
import { currentUser } from "@/lib/supabase/server";
import type { SessionInfo } from "@/types/market";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return guarded(req, { route: "GET /api/auth/session" }, async () => {
    const env = supabaseEnv();
    if (!env.configured) return ok<SessionInfo>({ accountsEnabled: false, missing: env.missing, user: null });
    const { user } = await currentUser();
    return ok<SessionInfo>({ accountsEnabled: true, missing: [], user: user ? { id: user.id, email: user.email ?? "" } : null });
  });
}
