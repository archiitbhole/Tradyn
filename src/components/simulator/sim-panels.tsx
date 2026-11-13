"use client";
import { ArrowDownUp, Download, FileSpreadsheet, FlaskConical, Play, Square } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { IconTile } from "@/components/ui/icon-tile";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils/cn";
import { STRATEGY_NAMES, type SimConfig, type StrategyName } from "@/lib/simulator/config";
import { exportFiles } from "@/lib/simulator/csv";
import type { MarketEngine, TraderRow } from "@/lib/simulator/engine";
import { SCENARIOS, runScenario, runSweep, type ScenarioResult, type SweepResult } from "@/lib/simulator/experiments";
import { BandChart, SweepChart } from "./sim-charts";
import { STRATEGY_COLOR, simInt, simNum, simPct } from "./sim-format";

const tone = (v: number) => (v > 0 ? "text-up" : v < 0 ? "text-down" : "text-muted");

/* ------------------------------------------------------------------ traders */

type TraderSort = "returnPct" | "portfolioValue" | "trades" | "rejected" | "trader";

export function TradersTable({ engine }: { engine: MarketEngine }) {
  const [q, setQ] = useState("");
  const [strategy, setStrategy] = useState<"all" | StrategyName>("all");
  const [sort, setSort] = useState<TraderSort>("returnPct");
  const [desc, setDesc] = useState(true);
  const rows = engine.traderRows()
    .filter((r) => (strategy === "all" || r.strategy === strategy) && (!q.trim() || r.trader.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => {
      const d = sort === "trader" ? a.trader.localeCompare(b.trader) : (a[sort] as number) - (b[sort] as number);
      return desc ? -d : d;
    });
  const head = (key: TraderSort, label: string, right = true) => (
    <th scope="col" className={cn("px-3 py-2 font-medium", right && "text-right")} aria-sort={sort === key ? (desc ? "descending" : "ascending") : "none"}>
      <button type="button" className={cn("inline-flex items-center gap-1 hover:text-foreground", sort === key && "text-foreground")} onClick={() => (sort === key ? setDesc(!desc) : (setSort(key), setDesc(key !== "trader")))}>
        {label} <ArrowDownUp className="size-3" aria-hidden />
      </button>
    </th>
  );
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Simulated traders</CardTitle>
          <CardDescription>Portfolios valued at the current simulated price.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="Find a trader" placeholder="Find T07…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-32" />
          <Select label="Strategy" value={strategy} onValueChange={(v) => setStrategy(v as typeof strategy)} className="h-8" options={[{ value: "all", label: "All strategies" }, ...STRATEGY_NAMES.map((n) => ({ value: n, label: n }))]} />
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        <div className="scroll-thin max-h-[560px] overflow-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead className="sticky top-0 z-10 bg-surface text-left text-xs text-muted shadow-[0_1px_0_var(--border)]">
              <tr>
                {head("trader", "Trader", false)}
                <th scope="col" className="px-3 py-2 font-medium">Strategy</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Cash (sim)</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Shares</th>
                {head("portfolioValue", "Value (sim)")}
                {head("returnPct", "Return")}
                {head("trades", "Trades")}
                {head("rejected", "Rejected")}
                <th scope="col" className="px-3 py-2 text-right font-medium">Last</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: TraderRow) => (
                <tr key={r.trader} className="border-t hover:bg-surface-2/60">
                  <td className="num px-3 py-2 font-medium">{r.trader}</td>
                  <td className="px-3 py-2"><span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: STRATEGY_COLOR[r.strategy] }} aria-hidden />{r.strategy}</td>
                  <td className="num px-3 py-2 text-right">{simNum(r.cash)}</td>
                  <td className="num px-3 py-2 text-right">{simInt(r.shares)}</td>
                  <td className="num px-3 py-2 text-right">{simNum(r.portfolioValue)}</td>
                  <td className={cn("num px-3 py-2 text-right font-medium", tone(r.returnPct))}>{simPct(r.returnPct)}</td>
                  <td className="num px-3 py-2 text-right">{simInt(r.trades)}</td>
                  <td className="num px-3 py-2 text-right">{simInt(r.rejected)}</td>
                  <td className={cn("px-3 py-2 text-right text-xs font-semibold", r.lastAction === "BUY" ? "text-up" : r.lastAction === "SELL" ? "text-down" : "text-faint")}>{r.lastAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? <p className="py-8 text-center text-[13px] text-muted">No trader matches.</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ experiment lab */

export function ExperimentLab({ base }: { base: SimConfig }) {
  const [mode, setMode] = useState<"scenario" | "sweep">("scenario");
  const [scenario, setScenario] = useState(SCENARIOS[1].key);
  const [runs, setRuns] = useState("20");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [result, setResult] = useState<ScenarioResult | SweepResult | null>(null);
  const stop = useRef(false);
  const n = Number(runs);

  async function start() {
    stop.current = false;
    setBusy(true);
    setResult(null);
    const cfg = { ...base, seed: base.seed ?? 1 };
    const onProgress = (d: number, t: number) => setProgress([d, t]);
    try {
      const sc = SCENARIOS.find((s) => s.key === scenario) ?? SCENARIOS[0];
      setResult(mode === "scenario" ? await runScenario(sc, n, cfg, onProgress, () => stop.current) : await runSweep(Math.max(2, Math.round(n / 2)), cfg, onProgress, () => stop.current));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <div className="group/tile flex items-center gap-2.5">
            <IconTile icon={FlaskConical} tone="sim" size="sm" />
            <div>
              <CardTitle>Experiment Lab</CardTitle>
              <CardDescription>Repeat runs with different seeds and compare.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Segmented label="Experiment" value={mode} onChange={setMode} options={[{ value: "scenario", label: "Scenario" }, { value: "sweep", label: "Trader-mix sweep" }]} className="w-full [&>button]:flex-1" />
          {mode === "scenario" ? (
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-muted">Scenario</p>
              <Select label="Scenario" value={scenario} onValueChange={setScenario} className="w-full" options={SCENARIOS.map((s) => ({ value: s.key, label: s.name }))} />
            </div>
          ) : (
            <p className="text-[13px] leading-5 text-muted">Runs the market with 0%, 25%, 50%, 75% and 90% Momentum traders (the rest split evenly) and measures how much the simulated price swings.</p>
          )}
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-muted">Runs{mode === "sweep" ? " per mix" : ""}</p>
            <Segmented label="Runs" value={runs} onChange={setRuns} options={["10", "20", "40"].map((v) => ({ value: v, label: mode === "sweep" ? String(Math.round(Number(v) / 2)) : v }))} />
          </div>
          <p className="text-xs leading-4 text-faint">Uses the current setup ({base.traders} traders, {base.steps} steps, {base.volatility.toLowerCase()} volatility).</p>
          {busy ? (
            <div className="space-y-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={progress[1]} aria-valuenow={progress[0]} aria-label="Experiment progress">
                <div className="h-full rounded-full bg-sim transition-[width]" style={{ width: `${progress[1] ? (progress[0] / progress[1]) * 100 : 0}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="num">{progress[0]} / {progress[1]} runs</span>
                <Button size="sm" variant="danger" onClick={() => (stop.current = true)}><Square /> Stop</Button>
              </div>
            </div>
          ) : (
            <Button variant="sim" className="w-full" onClick={start}><Play /> Run experiment</Button>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        {!result ? (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 px-6 text-center">
            <IconTile icon={FlaskConical} tone="sim" size="xl" />
            <p className="font-semibold tracking-tight">{busy ? "Running…" : "No experiment yet"}</p>
            <p className="max-w-sm text-[13px] leading-5 text-muted">{busy ? "Each run is a full simulation with its own seed." : "Pick a scenario and press Run. Results describe this artificial market only — not real markets."}</p>
          </div>
        ) : result.kind === "scenario" ? (
          <>
            <CardHeader>
              <div>
                <CardTitle>{result.scenario}</CardTitle>
                <CardDescription>{result.runs} runs · shaded: middle 80% of simulated price paths · line: median</CardDescription>
              </div>
              <Badge tone="sim">Simulated</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <BandChart result={result} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-[13px]">
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Strategy</th>
                      <th className="py-2 pr-3 text-right font-medium">Average return</th>
                      <th className="py-2 pr-3 text-right font-medium">Spread</th>
                      <th className="py-2 pr-3 text-right font-medium">Worst run</th>
                      <th className="py-2 pr-3 text-right font-medium">Best run</th>
                      <th className="py-2 text-right font-medium">Runs won</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r) => (
                      <tr key={r.strategy} className="border-t">
                        <td className="py-2 pr-3"><span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: STRATEGY_COLOR[r.strategy] }} aria-hidden />{r.strategy}</td>
                        <td className={cn("num py-2 pr-3 text-right font-medium", tone(r.meanReturnPct))}>{simPct(r.meanReturnPct)}</td>
                        <td className="num py-2 pr-3 text-right">{r.stdReturnPct.toFixed(2)} pts</td>
                        <td className={cn("num py-2 pr-3 text-right", tone(r.worstRunPct))}>{simPct(r.worstRunPct)}</td>
                        <td className={cn("num py-2 pr-3 text-right", tone(r.bestRunPct))}>{simPct(r.bestRunPct)}</td>
                        <td className="num py-2 text-right">{r.wins}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Interpretation text={result.insight} />
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <div>
                <CardTitle>Trader-mix sweep</CardTitle>
                <CardDescription>{result.runs} runs per mix</CardDescription>
              </div>
              <Badge tone="sim">Simulated</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <SweepChart result={result} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-[13px]">
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Momentum share</th>
                      <th className="py-2 pr-3 text-right font-medium">Step volatility</th>
                      <th className="py-2 pr-3 text-right font-medium">Largest fall</th>
                      <th className="py-2 text-right font-medium">High–low range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r) => (
                      <tr key={r.momentumShare} className="border-t">
                        <td className="num py-2 pr-3">{Math.round(r.momentumShare * 100)}%</td>
                        <td className="num py-2 pr-3 text-right">{r.volatilityPct.toFixed(3)}% <span className="text-faint">± {r.volatilityStd.toFixed(3)}</span></td>
                        <td className="num py-2 pr-3 text-right text-down">{simPct(r.maxDrawdownPct, 1)}</td>
                        <td className="num py-2 text-right">{r.priceRangePct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Interpretation text={result.insight} />
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}

/** Written conclusions are labelled as interpretation, separate from the measured numbers above them. */
function Interpretation({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-sim/30 bg-sim-soft px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-sim">Interpretation · simulated market only</p>
      <p className="mt-1 text-[13px] leading-5">{text}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ CSV export */

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportDialog({ engine, open, onOpenChange }: { engine: MarketEngine; open: boolean; onOpenChange: (v: boolean) => void }) {
  // build the files only while the dialog is open (they cover every step and order)
  const files = useMemo(() => (open ? exportFiles(engine) : []), [open, engine, engine.stepNo]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,520px)]">
        <DialogHeader title="Export simulation (CSV)" description={`Run at step ${engine.stepNo} of ${engine.cfg.steps}. Every file is marked as simulated data.`} />
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li key={f.name} className="group/tile flex items-center gap-3 rounded-xl border bg-surface-2/40 px-3 py-2">
              <IconTile icon={FileSpreadsheet} tone="sim" size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{f.label}</span>
                <span className="num block truncate text-xs text-faint">{f.name} · {(f.content.length / 1024).toFixed(1)} KB</span>
              </span>
              <Button size="sm" onClick={() => download(f.name, f.content)} aria-label={`Download ${f.label}`}><Download /> CSV</Button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <Button variant="sim" onClick={() => files.forEach((f, i) => setTimeout(() => download(f.name, f.content), i * 250))}><Download /> Download all {files.length}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
