import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}
const ALL = files(SRC).map((p) => ({ rel: path.relative(SRC, p).split(path.sep).join("/"), text: readFileSync(p, "utf8") }));
const imports = (text: string) => Array.from(text.matchAll(/from\s+"([^"]+)"/g), (m) => m[1]);
const isSim = (rel: string) => rel.startsWith("lib/simulator/") || rel.startsWith("components/simulator/") || rel.startsWith("app/simulator/");

describe("simulator isolation", () => {
  it("only the simulator section imports the simulator", () => {
    const offenders = ALL.filter((f) => !isSim(f.rel) && imports(f.text).some((i) => i.includes("/simulator"))).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("the simulator never imports real market data or calls the data API", () => {
    const offenders = ALL.filter((f) => isSim(f.rel) && (imports(f.text).some((i) => /market-data|providers|use-market|use-api|use-watchlists|supabase/.test(i)) || f.text.includes("/api/"))).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("the simulator page always shows the SIMULATION MODE banner", () => {
    const page = ALL.find((f) => f.rel === "components/simulator/simulator-page.tsx")!;
    expect(page.text).toContain("<SimBanner />");
    expect(ALL.find((f) => f.rel === "components/simulator/sim-banner.tsx")!.text).toMatch(/Simulation mode/);
  });
});

describe("secrets stay on the server", () => {
  it("no NEXT_PUBLIC_ variables are used anywhere", () => {
    expect(ALL.filter((f) => f.text.includes("NEXT_PUBLIC_")).map((f) => f.rel)).toEqual([]);
  });

  it("browser code never imports server-only modules or reads process.env", () => {
    const serverOnly = /@\/lib\/(providers|supabase|market-data\/(service|universe|cache))/;
    const offenders = ALL.filter((f) => /^["']use client["']/.test(f.text.trimStart()) && (imports(f.text).some((i) => serverOnly.test(i)) || f.text.includes("process.env"))).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("every module that reads credentials is marked server-only", () => {
    const readers = ALL.filter((f) => /process\.env|env\("(ANGEL|GROWW|SUPABASE)/.test(f.text) && !f.rel.startsWith("app/"));
    expect(readers.length).toBeGreaterThan(0);
    expect(readers.filter((f) => !f.text.includes('import "server-only"')).map((f) => f.rel)).toEqual([]);
  });

  it(".env.example holds names only, no values", () => {
    const lines = readFileSync(path.join(ROOT, ".env.example"), "utf8").split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l));
    expect(lines.length).toBeGreaterThan(8);
    const SAFE_DEFAULTS = new Set(["MARKET_DATA_PROVIDER", "YAHOO_ENABLED", "YAHOO_FALLBACK"]);
    const filled = lines.filter((l) => !SAFE_DEFAULTS.has(l.split("=")[0]) && l.split("=").slice(1).join("=").trim() !== "");
    expect(filled).toEqual([]);
  });
});
