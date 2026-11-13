import type { NextRequest } from "next/server";
import { guarded, ok } from "@/lib/api/respond";
import { getIndices } from "@/lib/market-data/service";

export const dynamic = "force-dynamic";

/** GET /api/market/indices — NIFTY 50, SENSEX, BANK NIFTY (and others the source provides) plus market status. */
export function GET(req: NextRequest) {
  return guarded(req, { route: "GET /api/market/indices" }, async () => {
    const { data, meta } = await getIndices();
    return ok(data, { meta, cacheSeconds: data.status.open ? 5 : 60 });
  });
}
