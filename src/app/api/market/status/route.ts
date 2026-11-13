import type { NextRequest } from "next/server";
import { guarded, ok } from "@/lib/api/respond";
import { marketStatus } from "@/lib/market-data/session";

export const dynamic = "force-dynamic";

/** GET /api/market/status — NSE/BSE cash-market session from the exchange timetable (needs no data source). */
export function GET(req: NextRequest) {
  return guarded(req, { route: "GET /api/market/status" }, async () => ok(marketStatus(), { cacheSeconds: 15 }));
}
