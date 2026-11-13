"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { PRESETS, STRATEGY_NAMES, defaultConfig, validateConfig, type SimConfig, type VolatilityLevel } from "@/lib/simulator/config";
import { STRATEGIES } from "@/lib/simulator/engine";
import { STRATEGY_COLOR } from "./sim-format";

function Num({ id, label, value, onChange, step, min, max, hint }: { id: string; label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; hint?: string }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" inputMode="decimal" className="num" value={Number.isFinite(value) ? value : ""} step={step} min={min} max={max} onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} />
      {hint ? <p className="mt-1 text-[11px] leading-4 text-faint">{hint}</p> : null}
    </div>
  );
}

export function SimSetup({ open, onOpenChange, config, onApply }: { open: boolean; onOpenChange: (v: boolean) => void; config: SimConfig; onApply: (c: SimConfig) => string | null }) {
  const [draft, setDraft] = useState<SimConfig>(config);
  const [randomSeed, setRandomSeed] = useState(config.seed == null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof SimConfig>(k: K, v: SimConfig[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const problem = validateConfig({ ...draft, seed: randomSeed ? null : draft.seed });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,640px)]">
        <DialogHeader title="Simulation setup" description="Applying a setup starts a new run from step 0." />
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-[13px] font-medium text-muted">Start from a preset</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PRESETS.map((p) => (
                <button key={p.key} type="button" onClick={() => setDraft({ ...defaultConfig(), seed: draft.seed, ...p.patch })} className="rounded-xl border bg-surface-2/40 px-3 py-2.5 text-left transition-colors hover:border-sim/50">
                  <span className="block text-sm font-medium">{p.name}</span>
                  <span className="block text-xs leading-4 text-muted">{p.description}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Num id="sim-traders" label="Traders" value={draft.traders} min={2} max={400} step={1} onChange={(v) => set("traders", Math.round(v))} />
            <Num id="sim-steps" label="Steps" value={draft.steps} min={10} max={5000} step={10} onChange={(v) => set("steps", Math.round(v))} />
            <Num id="sim-price" label="Start price (sim)" value={draft.initialPrice} min={0.01} step={1} onChange={(v) => set("initialPrice", v)} />
            <Num id="sim-sens" label="Sensitivity" value={draft.sensitivity} min={0.001} max={0.5} step={0.005} onChange={(v) => set("sensitivity", v)} hint="How far net demand moves the price" />
            <Num id="sim-cap" label="Largest step move %" value={Math.round(draft.maxMove * 1000) / 10} min={0.5} max={50} step={0.5} onChange={(v) => set("maxMove", v / 100)} />
            <Num id="sim-cash" label="Starting cash" value={draft.initialCash} min={0} step={500} onChange={(v) => set("initialCash", v)} />
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium text-muted">Volatility (order sizes)</p>
            <Segmented label="Volatility" value={draft.volatility} onChange={(v) => set("volatility", v as VolatilityLevel)} options={[{ value: "Low", label: "Low" }, { value: "Medium", label: "Medium" }, { value: "High", label: "High" }]} />
          </div>
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-muted">Trader mix (relative weight of each strategy)</legend>
            <div className="space-y-2.5">
              {STRATEGY_NAMES.map((n) => (
                <div key={n} className="grid grid-cols-[minmax(0,1fr)_120px_28px] items-center gap-3 sm:grid-cols-[170px_minmax(0,1fr)_28px]">
                  <label htmlFor={`mix-${n}`} className="min-w-0 text-[13px]" title={STRATEGIES[n].rule}>
                    <span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ background: STRATEGY_COLOR[n] }} aria-hidden />
                    {n}
                  </label>
                  <input id={`mix-${n}`} type="range" min={0} max={10} step={1} value={draft.mix[n]} onChange={(e) => set("mix", { ...draft.mix, [n]: Number(e.target.value) })} className="w-full accent-[var(--sim)]" />
                  <span className="num text-right text-[13px] text-muted">{draft.mix[n]}</span>
                </div>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-36">
              <Num id="sim-seed" label="Seed" value={randomSeed ? NaN : (draft.seed ?? 42)} min={0} step={1} onChange={(v) => { setRandomSeed(false); set("seed", Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0); }} />
            </div>
            <label className="mb-2 flex items-center gap-2 text-[13px] text-muted">
              <input type="checkbox" checked={randomSeed} onChange={(e) => setRandomSeed(e.target.checked)} className="size-4 accent-[var(--sim)]" />
              Different every run
            </label>
            <p className="mb-2 flex-1 text-[11px] leading-4 text-faint">The same seed and settings always give exactly the same run.</p>
          </div>
          {error ?? problem ? <p role="alert" className="rounded-lg border border-down/35 bg-down-soft px-3 py-2 text-[13px] text-down">{error ?? problem}</p> : null}
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" onClick={() => { setDraft(defaultConfig()); setRandomSeed(false); }}>Restore defaults</Button>
            <div className="flex gap-2">
              <DialogClose asChild><Button>Cancel</Button></DialogClose>
              <Button variant="sim" disabled={!!problem} onClick={() => { const e = onApply({ ...draft, seed: randomSeed ? null : draft.seed }); setError(e); if (!e) onOpenChange(false); }}>Apply and restart</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
