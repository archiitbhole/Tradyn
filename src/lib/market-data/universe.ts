import "server-only";
import generated from "@/data/instruments.generated.json";
import { INDICES, TRACKED, TRACKED_LABEL, type IndexDef } from "@/data/tracked";
import type { Exchange, Instrument } from "@/types/market";

interface GeneratedFile {
  generatedAt: string | null;
  source: string | null;
  instruments: { s: string; n: string; e: string; t: string }[];
  indices: { name: string; exchange: string; token: string }[];
}

const file = generated as GeneratedFile;
const trackedBySymbol = new Map(TRACKED.map(([symbol, name, sector]) => [symbol, { name, sector }]));

export const keyOf = (exchange: string, symbol: string) => `${exchange}:${symbol}`;

function build(): { all: Instrument[]; byKey: Map<string, Instrument> } {
  const all: Instrument[] = [];
  const byKey = new Map<string, Instrument>();
  const add = (i: Instrument) => {
    if (!byKey.has(i.key)) {
      byKey.set(i.key, i);
      all.push(i);
    }
  };
  for (const r of file.instruments) {
    if (r.e !== "NSE" && r.e !== "BSE") continue;
    const t = trackedBySymbol.get(r.s);
    add({ key: keyOf(r.e, r.s), symbol: r.s, name: t?.name ?? r.n ?? r.s, exchange: r.e, kind: "EQ", token: r.t, sector: t?.sector });
  }
  // The tracked list is always present, even before the first instrument sync (no tokens then).
  for (const ex of ["NSE", "BSE"] as const) {
    for (const [symbol, name, sector] of TRACKED) add({ key: keyOf(ex, symbol), symbol, name, exchange: ex, kind: "EQ", sector });
  }
  for (const d of INDICES) {
    const tok = d.angelToken ?? file.indices.find((x) => x.exchange === d.exchange && x.name === d.symbol)?.token;
    byKey.set(keyOf(d.exchange, d.symbol), { key: keyOf(d.exchange, d.symbol), symbol: d.symbol, name: d.name, exchange: d.exchange, kind: "INDEX", token: tok });
  }
  return { all, byKey };
}

const { all, byKey } = build();

export const universeInfo = {
  /** True once scripts/sync-instruments.mjs has produced the full exchange list. */
  full: file.instruments.length > 0,
  generatedAt: file.generatedAt,
  source: file.source ?? "Built-in Tradyn 100 list",
  counts: { NSE: all.filter((i) => i.exchange === "NSE").length, BSE: all.filter((i) => i.exchange === "BSE").length },
  trackedLabel: TRACKED_LABEL,
  trackedCount: TRACKED.length,
};

export function getInstrument(key: string): Instrument | undefined {
  return byKey.get(key);
}

export function indexDef(symbol: string): IndexDef | undefined {
  return INDICES.find((d) => d.symbol === symbol);
}

export function indexInstruments(headlineOnly = false): Instrument[] {
  return INDICES.filter((d) => !headlineOnly || d.headline).map((d) => byKey.get(keyOf(d.exchange, d.symbol))!);
}

/**
 * The tracking list for one exchange. With a `limit`, shares are taken sector by sector in turn,
 * so a shorter list still covers every sector instead of only the first one.
 */
export function trackedInstruments(exchange: Exchange = "NSE", limit = TRACKED.length): Instrument[] {
  const all = TRACKED.map(([symbol]) => byKey.get(keyOf(exchange, symbol))!).filter(Boolean);
  if (limit >= all.length) return all;
  const groups = new Map<string, Instrument[]>();
  for (const i of all) groups.set(i.sector ?? "", [...(groups.get(i.sector ?? "") ?? []), i]);
  const out: Instrument[] = [];
  for (let round = 0; out.length < limit; round++) {
    let added = false;
    for (const g of groups.values()) {
      if (g[round] && out.length < limit) {
        out.push(g[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}

/** Exact symbol first, then symbols that start with the text, then name/symbol contains. Indices included. */
export function searchLocal(text: string, exchange: Exchange | "ALL" = "ALL", limit = 12): Instrument[] {
  const t = text.trim().toUpperCase();
  if (!t) return [];
  const exact: Instrument[] = [];
  const starts: Instrument[] = [];
  const contains: Instrument[] = [];
  const consider = (i: Instrument) => {
    if (exchange !== "ALL" && i.exchange !== exchange) return;
    const name = i.name.toUpperCase();
    if (i.symbol === t) exact.push(i);
    else if (i.symbol.startsWith(t)) starts.push(i);
    else if (i.symbol.includes(t) || name.includes(t)) contains.push(i);
  };
  for (const d of INDICES) consider(byKey.get(keyOf(d.exchange, d.symbol))!);
  for (const i of all) {
    consider(i);
    if (exact.length + starts.length >= limit * 3) break;
  }
  const rank = (a: Instrument, b: Instrument) => Number(!!b.sector) - Number(!!a.sector) || a.symbol.length - b.symbol.length || a.symbol.localeCompare(b.symbol);
  return [...exact, ...starts.sort(rank), ...contains.sort(rank)].slice(0, limit);
}

export interface ListQuery {
  exchange: Exchange;
  scope: "tracked" | "all";
  q?: string;
  sector?: string;
}

/** Names only (no prices): the rows of the Markets table before quotes are attached. */
export function listInstruments({ exchange, scope, q, sector }: ListQuery): Instrument[] {
  let rows = scope === "tracked" ? trackedInstruments(exchange) : all.filter((i) => i.exchange === exchange);
  if (sector) rows = rows.filter((i) => i.sector === sector);
  const t = q?.trim().toUpperCase();
  if (t) rows = rows.filter((i) => i.symbol.includes(t) || i.name.toUpperCase().includes(t));
  return rows;
}
