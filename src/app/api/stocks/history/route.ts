import type { NextRequest } from "next/server";
import { guarded, ok } from "@/lib/api/respond";
import { historyQuery, params } from "@/lib/api/schemas";
import { getHistory } from "@/lib/market-data/service";

export const dynamic = "force-dynamic";

/** GET /api/stocks/history?symbol=NSE:RELIANCE&range=1M — OHLC candles (range: 1D 1W 1M 3M 6M 1Y 5Y). */
export function GET(req: NextRequest) {
  return guarded(req, { route: "GET /api/stocks/history", limit: 400 }, async () => {
    const q = historyQuery.parse(params(req.url));
    const { data, meta } = await getHistory(q.symbol, q.range);
    return ok(data, { meta, cacheSeconds: q.range === "1D" ? 30 : q.range === "1W" ? 300 : 1800 });
  });
}
