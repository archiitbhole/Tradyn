import type { NextRequest } from "next/server";
import { guarded, ok } from "@/lib/api/respond";
import { params, searchQuery } from "@/lib/api/schemas";
import { searchLocal } from "@/lib/market-data/universe";

export const dynamic = "force-dynamic";

/** GET /api/stocks/search?q= — shares and indices by symbol or company name (from the instrument list, so it works with any source). */
export function GET(req: NextRequest) {
  return guarded(req, { route: "GET /api/stocks/search", limit: 900 }, async () => {
    const q = searchQuery.parse(params(req.url));
    return ok(searchLocal(q.q, q.exchange, q.limit), { cacheSeconds: 3600 });
  });
}
