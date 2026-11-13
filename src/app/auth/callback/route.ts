import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Landing point of the email-confirmation link: swaps the one-time code for a session, then opens the watchlist. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const db = await userClient();
  let okay = false;
  if (db && code) okay = !(await db.auth.exchangeCodeForSession(code)).error;
  return NextResponse.redirect(new URL(okay ? "/watchlist?welcome=1" : "/settings?auth=failed#account", url.origin));
}
