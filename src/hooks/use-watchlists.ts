"use client";
import { useCallback, useState } from "react";
import type { Watchlist, WatchlistItem } from "@/types/market";
import { ApiClientError, apiFetch, useApi } from "./use-api";
import { useSession } from "./use-market";
import { usePref } from "./use-pref";

const DEVICE_KEY = "tradyn.watchlists.v1";
const DEFAULT_LISTS: Watchlist[] = [{ id: "device-1", name: "My watchlist", items: [] }];
const MAX_ITEMS = 100;
const MAX_LISTS = 20;

export interface WatchlistsApi {
  /** "account": saved in Supabase for the signed-in user. "device": saved in this browser only. */
  mode: "account" | "device";
  lists: Watchlist[];
  loading: boolean;
  error: string | null;
  busy: boolean;
  create(name: string): Promise<boolean>;
  rename(id: string, name: string): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  add(id: string, item: WatchlistItem): Promise<boolean>;
  removeItem(id: string, key: string): Promise<boolean>;
  has(key: string): boolean;
  clearError(): void;
}

export function useWatchlists(): WatchlistsApi {
  const { session, loading: sessionLoading } = useSession();
  const account = !!session?.user;
  const remote = useApi<Watchlist[]>(account ? "/api/watchlists" : null);
  const [device, setDevice] = usePref<Watchlist[]>(DEVICE_KEY, DEFAULT_LISTS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lists = account ? (remote.data ?? []) : device;

  const call = useCallback(
    async (method: "POST" | "PUT" | "DELETE", body?: unknown, query = ""): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        await apiFetch<Watchlist[]>("/api/watchlists" + query, { method, json: body });
        await remote.reload();
        return true;
      } catch (e) {
        setError(e instanceof ApiClientError ? e.error.message : "The change could not be saved.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [remote],
  );

  const local = useCallback(
    (change: (lists: Watchlist[]) => Watchlist[] | string): boolean => {
      let problem: string | null = null;
      setDevice((prev) => {
        const next = change(prev);
        if (typeof next === "string") {
          problem = next;
          return prev;
        }
        return next;
      });
      setError(problem);
      return !problem;
    },
    [setDevice],
  );

  return {
    mode: account ? "account" : "device",
    lists,
    loading: sessionLoading || (account && remote.loading),
    error: error ?? (account ? (remote.error?.message ?? null) : null),
    busy,
    clearError: () => setError(null),
    has: (key) => lists.some((l) => l.items.some((i) => i.key === key)),
    create: async (name) => {
      const n = name.trim().slice(0, 40);
      if (!n) return false;
      if (account) return call("POST", { name: n });
      return local((ls) => (ls.length >= MAX_LISTS ? `You can have up to ${MAX_LISTS} watchlists.` : [...ls, { id: "device-" + Date.now().toString(36), name: n, items: [] }]));
    },
    rename: async (id, name) => {
      const n = name.trim().slice(0, 40);
      if (!n) return false;
      if (account) return call("PUT", { id, name: n });
      return local((ls) => ls.map((l) => (l.id === id ? { ...l, name: n } : l)));
    },
    remove: async (id) => {
      if (account) return call("DELETE", undefined, "?id=" + encodeURIComponent(id));
      return local((ls) => ls.filter((l) => l.id !== id));
    },
    add: async (id, item) => {
      if (account) return call("PUT", { id, add: item.key });
      return local((ls) => {
        const l = ls.find((x) => x.id === id);
        if (!l) return "That watchlist no longer exists.";
        if (l.items.some((i) => i.key === item.key)) return ls;
        if (l.items.length >= MAX_ITEMS) return `A watchlist can hold up to ${MAX_ITEMS} shares.`;
        return ls.map((x) => (x.id === id ? { ...x, items: [...x.items, item] } : x));
      });
    },
    removeItem: async (id, key) => {
      if (account) return call("PUT", { id, remove: key });
      return local((ls) => ls.map((l) => (l.id === id ? { ...l, items: l.items.filter((i) => i.key !== key) } : l)));
    },
  };
}
