import type { NextRequest } from "next/server";
import { guarded, ok } from "@/lib/api/respond";
import { params, quotesQuery } from "@/lib/api/schemas";
import { getQuotes } from "@/lib/market-data/service";
import { marketStatus } from "@/lib/market-data/session";

export const dynamic = "force-dynamic";

/** GET /api/stocks/quotes?symbols=NSE:RELIANCE,NSE:TCS — up to 60 at once (used by watchlists). */
export function GET(req: NextRequest) {
  return guarded(req, { route: "GET /api/stocks/quotes" }, async () => {
    const q = quotesQuery.parse(params(req.url));
    const { data, meta } = await getQuotes(q.symbols);
    return ok(data, { meta, cacheSeconds: marketStatus().open ? 5 : 60 });
  });
}
