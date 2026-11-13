import { describe, expect, it } from "vitest";
import { marketSummary, strategySummary } from "@/lib/simulator/analysis";
import { defaultConfig, validateConfig } from "@/lib/simulator/config";
import { exportFiles, toCsv } from "@/lib/simulator/csv";
import { demandRatio, MarketEngine, nextPrice } from "@/lib/simulator/engine";
import { SCENARIOS, runScenario, runSweep } from "@/lib/simulator/experiments";

describe("price formula", () => {
  it("follows New = Old × (1 + Sensitivity × (B − S)/(B + S + 1))", () => {
    expect(demandRatio(30, 10)).toBeCloseTo(20 / 41);
    expect(nextPrice(100, demandRatio(30, 10), 0.02, 0.05, 0.01).price).toBeCloseTo(100 * (1 + 0.02 * (20 / 41)));
  });

  it("caps one step's move and never goes below the minimum price", () => {
    expect(nextPrice(100, 1, 0.5, 0.05, 0.01)).toEqual({ price: 105, capped: true });
    expect(nextPrice(0.011, -1, 0.5, 0.5, 0.01).price).toBe(0.01);
  });
});

describe("market engine", () => {
  it("is deterministic for a seed", () => {
    const a = new MarketEngine({ seed: 7, steps: 200 }).run();
    const b = new MarketEngine({ seed: 7, steps: 200 }).run();
    const c = new MarketEngine({ seed: 8, steps: 200 }).run();
    expect(a.prices).toEqual(b.prices);
    expect(a.prices).not.toEqual(c.prices);
  });

  it("keeps cash and shares consistent and records every step", () => {
    const e = new MarketEngine({ seed: 3, steps: 150, traders: 30 }).run();
    expect(e.history).toHaveLength(151);
    expect(e.traders.every((t) => t.cash >= -1e-9 && t.shares >= 0)).toBe(true);
    // orders fill against the market at the step's price (as in the original simulator), so each
    // trader's value is exactly cash + shares × price
    for (const r of e.traderRows()) expect(r.portfolioValue).toBeCloseTo(r.cash + r.shares * e.price, 6);
    const ms = marketSummary(e);
    expect(ms.finalPrice).toBe(e.price);
    expect(strategySummary(e).reduce((s, x) => s + x.traders, 0)).toBe(30);
  });

  it("events change behaviour for their duration", () => {
    const calm = new MarketEngine({ seed: 11, steps: 60 }).run();
    const shocked = new MarketEngine({ seed: 11, steps: 60 }).run(undefined, { 20: "shock" });
    expect(shocked.eventLog).toEqual([{ step: 20, key: "shock", name: "Market shock", duration: 6 }]);
    expect(shocked.prices[30]).toBeLessThan(calm.prices[30]);
  });

  it("validates settings", () => {
    expect(validateConfig(defaultConfig())).toBeNull();
    expect(validateConfig({ ...defaultConfig(), traders: 1 })).toMatch(/Traders/);
    expect(() => new MarketEngine({ steps: 5 })).toThrow(/Steps/);
  });
});

describe("experiments", () => {
  it("compares strategies over repeated runs", async () => {
    const r = await runScenario(SCENARIOS[1], 4, { ...defaultConfig(), steps: 120 });
    expect(r?.runs).toBe(4);
    expect(r?.rows.reduce((s, x) => s + x.wins, 0)).toBe(4);
    expect(r?.p10.every((v, i) => v <= r.p90[i])).toBe(true);
  });

  it("sweeps the Momentum share", async () => {
    const r = await runSweep(2, { ...defaultConfig(), steps: 100 });
    expect(r?.rows.map((x) => x.momentumShare)).toEqual([0, 0.25, 0.5, 0.75, 0.9]);
  });
});

describe("CSV export", () => {
  it("quotes properly and defuses spreadsheet formulas", () => {
    expect(toCsv(["a", "b"], [["=SUM(A1)", 'x,"y"']])).toBe('a,b\r\n\'=SUM(A1),"x,""y"""\r\n');
  });

  it("marks every file as simulated data", () => {
    const files = exportFiles(new MarketEngine({ seed: 1, steps: 50 }).run());
    expect(files).toHaveLength(6);
    for (const f of files) expect(f.content.split("\r\n")[0]).toContain("SIMULATED DATA");
  });
});
