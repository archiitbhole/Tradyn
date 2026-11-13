import type { NextRequest } from "next/server";
import pkg from "../../../../package.json";
import { guarded, ok } from "@/lib/api/respond";
import { universeInfo } from "@/lib/market-data/universe";
import { providerInfos, selectProvider, yahooFallbackEnabled } from "@/lib/providers";
import { supabaseEnv } from "@/lib/supabase/config";
import type { SettingsPayload } from "@/types/market";

export const dynamic = "force-dynamic";

/** GET /api/settings — which sources and services are set up. Lists the NAMES of missing settings only, never any value. */
export function GET(req: NextRequest) {
  return guarded(req, { route: "GET /api/settings" }, async () => {
    const sel = selectProvider();
    const sb = supabaseEnv();
    const data: SettingsPayload = {
      providers: providerInfos(), selected: sel.primary, selectionMode: sel.mode, problem: sel.problem, yahooFallback: yahooFallbackEnabled(),
      universe: { full: universeInfo.full, generatedAt: universeInfo.generatedAt, source: universeInfo.source, nse: universeInfo.counts.NSE, bse: universeInfo.counts.BSE, trackedLabel: universeInfo.trackedLabel, trackedCount: universeInfo.trackedCount },
      accounts: { enabled: sb.configured, missing: sb.missing, tokenSharing: !!(sb.url && sb.serviceKey) },
      version: pkg.version,
    };
    return ok(data);
  });
}
