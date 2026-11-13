"use client";
import { Activity, BarChart3, Download, FastForward, FlaskConical, Pause, Play, RotateCcw, Settings2, SkipForward, Trophy, Users, Zap } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { Segmented } from "@/components/ui/segmented";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils/cn";
import { marketSummary, strategySummary } from "@/lib/simulator/analysis";
import { EVENTS, STRATEGIES, type EventKey } from "@/lib/simulator/engine";
import { GrowthChart, PressureChart, SimPriceChart } from "./sim-charts";
import { STRATEGY_COLOR, simInt, simNum, simPct } from "./sim-format";
import { ExperimentLab, ExportDialog, TradersTable } from "./sim-panels";
import { SimBanner } from "./sim-banner";
import { SimSetup } from "./sim-setup";
import { useSimulation } from "./use-simulation";

const SPEEDS = [
  { value: "5", label: "5/s" },
  { value: "20", label: "20/s" },
  { value: "60", label: "60/s" },
  { value: "200", label: "200/s" },
];
const EVENT_TONE: Record<EventKey, "up" | "down"> = { positive: "up", bull: "up", negative: "down", shock: "down" };
const tone = (v: number) => (v > 0 ? "text-up" : v < 0 ? "text-down" : "text-muted");

function Stat({ label, value, sub, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className="rounded-xl border bg-surface px-3.5 py-3 shadow-card">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn("num mt-1 text-lg font-semibold tracking-tight", className)}>{value}</dd>
      {sub ? <p className="mt-0.5 text-[11px] leading-4 text-faint">{sub}</p> : null}
    </div>
  );
}

function CardHead({ icon, title, description, children }: { icon: typeof Activity; title: string; description?: string; children?: React.ReactNode }) {
  return (
    <CardHeader>
      <div className="group/tile flex items-center gap-2.5">
        <IconTile icon={icon} tone="sim" size="sm" />
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
      </div>
      {children}
    </CardHeader>
  );
}

export function SimulatorPage() {
  const sim = useSimulation();
  const e = sim.engine;
  const [setupOpen, setSetupOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const last = e.history[e.history.length - 1];
  const change = (e.price / e.cfg.initialPrice - 1) * 100;
  const leaders = e.traderRows().sort((a, b) => b.returnPct - a.returnPct).slice(0, 5);
  const ms = marketSummary(e);
  const strat = strategySummary(e);
  const active = e.activeEvents;

  return (
    <div data-mode="simulation">
      <SimBanner />
      <PageHeader
        icon={FlaskConical}
        tone="sim"
        title="Tradyn Simulator"
        description="Rule-based traders buy and sell one artificial share; its price moves only with their combined demand."
        actions={
          <>
            <Button onClick={() => setSetupOpen(true)}><Settings2 /> Setup</Button>
            <Button onClick={() => setExportOpen(true)} disabled={e.stepNo === 0}><Download /> Export CSV</Button>
          </>
        }
      />

      <Tabs defaultValue="run">
        <TabsList className="mb-4 max-w-full overflow-x-auto">
          <TabsTrigger value="run"><Activity /> Market</TabsTrigger>
          <TabsTrigger value="analysis"><BarChart3 /> Analysis</TabsTrigger>
          <TabsTrigger value="traders"><Users /> Traders</TabsTrigger>
          <TabsTrigger value="lab"><FlaskConical /> Experiment Lab</TabsTrigger>
        </TabsList>

        <TabsContent value="run" className="space-y-4">
          <Card className="flex flex-wrap items-center gap-2 p-3">
            {sim.running ? (
              <Button variant="sim" onClick={sim.pause}><Pause /> Pause</Button>
            ) : (
              <Button variant="sim" onClick={sim.play} disabled={e.finished}><Play /> {e.stepNo ? "Resume" : "Start"}</Button>
            )}
            <Button onClick={() => sim.step(1)} disabled={e.finished || sim.running}><SkipForward /> Step</Button>
            <Button onClick={() => sim.step(10)} disabled={e.finished || sim.running}>+10</Button>
            <Button onClick={sim.finish} disabled={e.finished}><FastForward /> Run to end</Button>
            <Button variant="ghost" onClick={() => sim.reset()}><RotateCcw /> Reset</Button>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[13px] text-muted">Speed</span>
              <Segmented label="Speed (steps per second)" size="sm" value={String(sim.speed)} onChange={(v) => sim.setSpeed(Number(v))} options={SPEEDS} />
            </div>
          </Card>

          <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Sim price" value={simNum(e.price)} sub={<span className={tone(change)}>{simPct(change)} since start</span>} />
            <Stat label="Step" value={`${simInt(e.stepNo)} / ${simInt(e.cfg.steps)}`} sub={e.finished ? "Run complete" : sim.running ? "Running" : "Paused"} />
            <Stat label="Sentiment" value={e.sentiment.toLowerCase()} className={cn("capitalize", e.sentiment === "BULLISH" ? "text-up" : e.sentiment === "BEARISH" ? "text-down" : "")} sub="smoothed demand" />
            <Stat label="Demand ratio" value={(last.demandRatio >= 0 ? "+" : "−") + Math.abs(last.demandRatio).toFixed(3)} className={tone(last.demandRatio)} sub="(buy − sell) ÷ (buy + sell + 1)" />
            <Stat label="Volume, last step" value={simInt(last.volume)} sub={`${last.buyers} buyers · ${last.sellers} sellers`} />
            <Stat label="Rejected orders" value={simInt(ms.rejectedOrders)} sub="not enough cash or shares" />
          </dl>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="min-w-0 xl:col-span-2">
              <CardHead icon={Activity} title="Simulated price" description="Purple: sim price · grey: 20-step average · shading: event windows">
                <Badge tone="sim">Simulated</Badge>
              </CardHead>
              <CardContent><SimPriceChart engine={e} /></CardContent>
            </Card>

            <Card>
              <CardHead icon={Zap} title="Market events" description="Change trader behaviour for a few steps — never the price directly." />
              <CardContent className="space-y-2">
                {(Object.keys(EVENTS) as EventKey[]).map((k) => {
                  const ev = EVENTS[k];
                  const on = active.find((a) => a.key === k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => sim.trigger(k)}
                      disabled={e.finished}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-50",
                        on ? (EVENT_TONE[k] === "up" ? "border-up/50 bg-up-soft" : "border-down/50 bg-down-soft") : "bg-surface-2/40 hover:border-sim/50",
                      )}
                    >
                      <span className="min-w-0">
                        <span className={cn("block text-sm font-medium", EVENT_TONE[k] === "up" ? "text-up" : "text-down")}>{ev.name}</span>
                        <span className="block text-xs leading-4 text-muted">{ev.description}</span>
                      </span>
                      {on ? <Badge tone={EVENT_TONE[k]}>{on.remaining} left</Badge> : null}
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="min-w-0 xl:col-span-2">
              <CardHead icon={BarChart3} title="Buy and sell pressure" description="Shares bought (up) and sold (down) per step, last 80 steps; line: net demand" />
              <CardContent>{e.stepNo ? <PressureChart engine={e} /> : <p className="py-10 text-center text-[13px] text-muted">Start the run to see order flow.</p>}</CardContent>
            </Card>
            <Card>
              <CardHead icon={Trophy} title="Leaderboard" description="Best returns so far" />
              <CardContent>
                <ol className="space-y-1">
                  {leaders.map((t, i) => (
                    <li key={t.trader} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-[13px] hover:bg-surface-2">
                      <span className="num w-4 text-faint">{i + 1}</span>
                      <span className="num font-medium">{t.trader}</span>
                      <span className="min-w-0 flex-1 truncate text-muted"><span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: STRATEGY_COLOR[t.strategy] }} aria-hidden />{t.strategy}</span>
                      <span className={cn("num font-medium", tone(t.returnPct))}>{simPct(t.returnPct)}</span>
                    </li>
                  ))}
                </ol>
                <div className="mt-3 border-t pt-3">
                  <p className="mb-1.5 text-xs font-medium text-muted">Event log</p>
                  {e.eventLog.length ? (
                    <ul className="scroll-thin max-h-28 space-y-1 overflow-y-auto text-xs">
                      {[...e.eventLog].reverse().map((ev, i) => (
                        <li key={i} className="flex justify-between gap-3"><span className={EVENT_TONE[ev.key] === "up" ? "text-up" : "text-down"}>{ev.name}</span><span className="num text-faint">step {ev.step}</span></li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-faint">No events yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Final sim price" value={simNum(ms.finalPrice)} sub={<span className={tone(ms.totalReturnPct)}>{simPct(ms.totalReturnPct)} over {ms.steps} steps</span>} />
            <Stat label="Highest / lowest" value={`${simNum(ms.highest)} / ${simNum(ms.lowest)}`} />
            <Stat label="Step volatility" value={ms.volatilityPct.toFixed(3) + "%"} sub="std. dev. of step returns" />
            <Stat label="Largest fall from a peak" value={simPct(ms.maxDrawdownPct)} className="text-down" />
            <Stat label="Total volume" value={simInt(ms.totalVolume)} sub="shares traded" />
            <Stat label="Rejected orders" value={simInt(ms.rejectedOrders)} />
            <Stat label="Capped steps" value={simInt(ms.cappedSteps)} sub={`price move hit the ±${(e.cfg.maxMove * 100).toFixed(1)}% limit`} />
            <Stat label="Traders" value={simInt(e.traders.length)} sub={`${e.cfg.volatility} volatility · seed ${e.cfg.seed ?? "random"}`} />
          </dl>
          <div className="grid gap-4 xl:grid-cols-5">
            <Card className="min-w-0 xl:col-span-3">
              <CardHead icon={Activity} title="Portfolio growth" description="Average portfolio value of each strategy's traders (sim)" />
              <CardContent>{e.stepNo ? <GrowthChart engine={e} /> : <p className="py-10 text-center text-[13px] text-muted">Start the run to compare strategies.</p>}</CardContent>
            </Card>
            <Card className="min-w-0 xl:col-span-2">
              <CardHead icon={BarChart3} title="Strategy performance" description="Measured from this run" />
              <CardContent className="space-y-3">
                {strat.map((s) => (
                  <div key={s.strategy} className="rounded-xl border bg-surface-2/40 px-3.5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium"><span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ background: STRATEGY_COLOR[s.strategy] }} aria-hidden />{s.strategy}</span>
                      <span className={cn("num text-sm font-semibold", tone(s.meanReturnPct))}>{simPct(s.meanReturnPct)}</span>
                    </div>
                    <p className="mt-1 text-xs leading-4 text-muted">{STRATEGIES[s.strategy].rule}</p>
                    <p className="num mt-1.5 text-[11px] text-faint">{s.traders} traders · spread {s.stdReturnPct.toFixed(2)} pts · best {simPct(s.bestPct)} · worst {simPct(s.worstPct)} · {s.avgTrades.toFixed(1)} trades each</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="traders">
          <TradersTable engine={e} />
        </TabsContent>

        <TabsContent value="lab">
          <ExperimentLab base={sim.config} />
        </TabsContent>
      </Tabs>

      {setupOpen ? <SimSetup open={setupOpen} onOpenChange={setSetupOpen} config={sim.config} onApply={(c) => sim.reset(c)} /> : null}
      <ExportDialog engine={e} open={exportOpen} onOpenChange={setExportOpen} />
    </div>
  );
}
