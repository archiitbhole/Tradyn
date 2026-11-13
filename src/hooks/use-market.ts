"use client";
import type { MarketStatus, SessionInfo } from "@/types/market";
import { useApi } from "./use-api";
import { usePref } from "./use-pref";

export type RefreshPref = "auto" | "slow" | "off";

export function useMarketStatus() {
  return useApi<MarketStatus>("/api/market/status", { refreshMs: 60_000 });
}

/**
 * How often to ask for new prices. Controlled polling, not streaming: quick while the market is
 * open, slow when it is closed, and the browser pauses it while the tab is hidden.
 */
export function useRefreshMs(kind: "quotes" | "lists" | "charts" = "quotes"): number {
  const [pref] = usePref<RefreshPref>("tradyn.refresh", "auto");
  const { data: status } = useMarketStatus();
  if (pref === "off") return 0;
  const base = kind === "quotes" ? 10_000 : kind === "lists" ? 20_000 : 60_000;
  const open = status?.open ?? false;
  return (open ? base : Math.max(base * 6, 120_000)) * (pref === "slow" ? 3 : 1);
}

export function useSession() {
  const s = useApi<SessionInfo>("/api/auth/session");
  return { session: s.data, loading: s.loading, reload: s.reload };
}
