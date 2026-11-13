#!/usr/bin/env node
/**
 * Downloads Angel One's public instrument master and writes the list of NSE and BSE shares
 * (symbol, name, exchange, token) to src/data/instruments.generated.json.
 *
 * It runs automatically before every build ("prebuild"), so each Vercel deployment ships the
 * current list of listed shares with no database and no cold-start download.
 *
 *   node scripts/sync-instruments.mjs             fail if the download fails
 *   node scripts/sync-instruments.mjs --optional  keep the existing file if the download fails (used by prebuild)
 *
 * Only names and exchange codes are stored — never prices.
 */
import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL_ = process.env.ANGEL_MASTER_URL || "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "instruments.generated.json");
const NSE_SERIES = new Set(["EQ", "BE", "BZ", "SM", "ST"]);
const optional = process.argv.includes("--optional");

/** Shares only: NSE series EQ/BE/BZ/SM/ST and BSE equity scrip codes 500000–599999. */
export function parseAngelMaster(rows) {
  const instruments = [];
  const indices = [];
  const seen = new Set();
  for (const r of rows) {
    const seg = r.exch_seg;
    const sym = String(r.symbol ?? "").trim();
    const tok = String(r.token ?? "").trim();
    const type = String(r.instrumenttype ?? "").trim();
    if (!sym || !tok) continue;
    if (type === "AMXIDX" && (seg === "NSE" || seg === "BSE")) {
      indices.push({ name: String(r.name ?? sym).trim().toUpperCase(), exchange: seg, token: tok });
      continue;
    }
    if (type) continue; // futures, options, commodities...
    let item;
    if (seg === "NSE") {
      const i = sym.lastIndexOf("-");
      if (i < 0 || !NSE_SERIES.has(sym.slice(i + 1))) continue;
      const base = sym.slice(0, i);
      item = { s: base, n: String(r.name ?? base).trim(), e: "NSE", t: tok };
    } else if (seg === "BSE") {
      const n = Number(tok);
      if (!Number.isInteger(n) || n < 500000 || n >= 600000) continue;
      item = { s: sym, n: String(r.name ?? sym).trim(), e: "BSE", t: tok };
    } else continue;
    const key = item.e + ":" + item.s;
    if (seen.has(key)) continue;
    seen.add(key);
    instruments.push(item);
  }
  instruments.sort((a, b) => (a.e === b.e ? a.s.localeCompare(b.s) : a.e === "NSE" ? -1 : 1));
  return { instruments, indices };
}

async function main() {
  const res = await fetch(URL_, { headers: { "User-Agent": "Tradyn/3 instrument sync" }, signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(URL_).host}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected instrument master format");
  const { instruments, indices } = parseAngelMaster(rows);
  if (instruments.length < 1000) throw new Error(`Only ${instruments.length} shares found — refusing to overwrite the list`);
  const out = { generatedAt: new Date().toISOString(), source: "Angel One instrument master", instruments, indices };
  await writeFile(OUT, JSON.stringify(out));
  const nse = instruments.filter((i) => i.e === "NSE").length;
  console.log(`instruments: wrote ${nse} NSE + ${instruments.length - nse} BSE shares and ${indices.length} indices`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(async (err) => {
    if (!optional) {
      console.error("instruments: sync failed —", err.message);
      process.exit(1);
    }
    let have = 0;
    try {
      have = JSON.parse(await readFile(OUT, "utf8")).instruments.length;
    } catch {}
    console.warn(`instruments: could not refresh the share list (${err.message}); keeping the existing file (${have} shares).` +
      (have ? "" : " Search and Markets will use the built-in Tradyn 100 list until a sync succeeds."));
  });
}
