import type { NextRequest } from "next/server";
import { guarded, ok } from "@/lib/api/respond";
import { listQuery, params } from "@/lib/api/schemas";
import { getMarketList } from "@/lib/market-data/service";
import { marketStatus } from "@/lib/market-data/session";

export const dynamic = "force-dynamic";

/** GET /api/market/list — one page of the Markets table (search, sector filter, sorting, pagination). */
export function GET(req: NextRequest) {
  return guarded(req, { route: "GET /api/market/list" }, async () => {
    const q = listQuery.parse(params(req.url));
    const { data, meta } = await getMarketList(q);
    return ok(data, { meta, cacheSeconds: marketStatus().open ? 10 : 120 });
  });
}
