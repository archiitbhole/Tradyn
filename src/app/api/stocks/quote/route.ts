import type { NextRequest } from "next/server";
import { guarded, ok } from "@/lib/api/respond";
import { params, quoteQuery } from "@/lib/api/schemas";
import { getQuote } from "@/lib/market-data/service";
import { marketStatus } from "@/lib/market-data/session";

export const dynamic = "force-dynamic";

/** GET /api/stocks/quote?symbol=NSE:RELIANCE */
export function GET(req: NextRequest) {
  return guarded(req, { route: "GET /api/stocks/quote" }, async () => {
    const q = quoteQuery.parse(params(req.url));
    const { data, meta } = await getQuote(q.symbol);
    return ok(data, { meta, cacheSeconds: marketStatus().open ? 5 : 60 });
  });
}
