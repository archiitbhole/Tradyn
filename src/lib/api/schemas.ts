import { z } from "zod";
import { RANGES, SORT_KEYS } from "@/types/market";

export const exchange = z.enum(["NSE", "BSE"]);
/** "NSE:RELIANCE", "NSE:NIFTY 50", "NSE:M&M", "NSE:BAJAJ-AUTO" */
export const instrumentKey = z.string().trim().max(48).regex(/^(NSE|BSE):[A-Z0-9][A-Z0-9 &.\-*]{0,39}$/, "use the form NSE:SYMBOL or BSE:SYMBOL");

export const searchQuery = z.object({
  q: z.string().trim().min(1, "type at least one character").max(40),
  exchange: z.enum(["NSE", "BSE", "ALL"]).default("ALL"),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

export const quoteQuery = z.object({ symbol: instrumentKey });
export const quotesQuery = z.object({
  symbols: z.string().max(3000).transform((s) => Array.from(new Set(s.split(",").map((x) => x.trim()).filter(Boolean)))).pipe(z.array(instrumentKey).min(1).max(60)),
});
export const historyQuery = z.object({ symbol: instrumentKey, range: z.enum(RANGES).default("1M") });
export const moversQuery = z.object({ exchange: exchange.default("NSE") });

export const listQuery = z.object({
  exchange: exchange.default("NSE"),
  scope: z.enum(["tracked", "all"]).default("tracked"),
  q: z.string().trim().max(40).optional(),
  sector: z.string().trim().max(40).optional(),
  sort: z.enum(SORT_KEYS).default("symbol"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).max(2000).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
});

const listName = z.string().trim().min(1, "give the watchlist a name").max(40);
export const watchlistCreate = z.object({ name: listName });
export const watchlistUpdate = z.object({ id: z.uuid(), name: listName.optional(), add: instrumentKey.optional(), remove: instrumentKey.optional() })
  .refine((v) => [v.name, v.add, v.remove].filter((x) => x !== undefined).length === 1, "send exactly one of name, add or remove");
export const watchlistDelete = z.object({ id: z.uuid() });

export const credentials = z.object({ email: z.email().max(254), password: z.string().min(8, "use at least 8 characters").max(72) });

export function params(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url).searchParams);
}
