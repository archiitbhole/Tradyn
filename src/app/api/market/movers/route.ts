import type { NextRequest } from "next/server";
import { guarded, ok } from "@/lib/api/respond";
import { moversQuery, params } from "@/lib/api/schemas";
import { getMovers } from "@/lib/market-data/service";
import { marketStatus } from "@/lib/market-data/session";

export const dynamic = "force-dynamic";

/** GET /api/market/movers?exchange=NSE — gainers, losers, most active, breadth and sector averages over the tracking list. */
export function GET(req: NextRequest) {
  return guarded(req, { route: "GET /api/market/movers" }, async () => {
    const q = moversQuery.parse(params(req.url));
    const { data, meta } = await getMovers(q.exchange);
    return ok(data, { meta, cacheSeconds: marketStatus().open ? 15 : 120 });
  });
}
