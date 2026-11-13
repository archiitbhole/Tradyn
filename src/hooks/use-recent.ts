"use client";
import { useCallback } from "react";
import type { WatchlistItem } from "@/types/market";
import { usePref } from "./use-pref";

const EMPTY: WatchlistItem[] = [];

/** The last few shares opened on this device (for the Stock Details page). */
export function useRecent() {
  const [recent, setRecent] = usePref<WatchlistItem[]>("tradyn.recent", EMPTY);
  const remember = useCallback((item: WatchlistItem) => setRecent((prev) => [item, ...prev.filter((p) => p.key !== item.key)].slice(0, 12)), [setRecent]);
  const clear = useCallback(() => setRecent([]), [setRecent]);
  return { recent, remember, clear };
}
