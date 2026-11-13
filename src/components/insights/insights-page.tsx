"use client";
import { Activity, BarChart3, Gauge, PieChart, Scale, Sparkles, TrendingUp, Waves } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BreadthBar } from "@/components/dashboard/breadth-bar";
import { SectorBars } from "@/components/charts/sector-bars";
import { Delta } from "@/components/shared/delta";
import { PageHeader } from "@/components/shared/page-header";
import { QuoteRow } from "@/components/shared/quote-row";
import { FallbackNotice, SourceLine } from "@/components/shared/source";
import { ErrorPanel, RowsSkeleton } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconTile, type Tone } from "@/components/ui/icon-tile";
import { useApi } from "@/hooks/use-api";
import { useRefreshMs } from "@/hooks/use-market";
import { dayRanges, readings, relativePerformance, trendStats, volumeStats } from "@/lib/market-data/insights";
import { cn } from "@/lib/utils/cn";
import { fmtPct, fmtPrice, fmtVolume, keyToPath } from "@/lib/utils/format";
import type { History, IndicesPayload, MarketList, Movers } from "@/types/market";
import type { LucideIcon } from "lucide-react";

function Head({ icon, tone, title, children }: { icon: LucideIcon; tone: Tone; title: string; children?: React.ReactNode }) {
  return (
    <CardHeader>
      <div className="group/tile flex items-center gap-2.5">
        <IconTile icon={icon} tone={tone} size="sm" />
        <div>
          <CardTitle>{title}</CardTitle>
          {children ? <CardDescription>{children}</CardDescription> : null}
        </div>
      </div>
      <Badge tone="info">Measured</Badge>
    </CardHeader>
  );
}

function Fact({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-xl border bg-surface-2/50 px-3.5 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn("num mt-1 text-[15px] font-semibold", tone === "up" && "text-up", tone === "down" && "text-down")}>{value}</dd>
      {sub ? <p className="mt-0.5 text-[11px] leading-4 text-faint">{sub}</p> : null}
    </div>
  );
}

const vsAvg = (last: number, avg: number | null) => (avg == null ? { value: "—", sub: "not enough history" } : { value: fmtPrice(avg), sub: `${last >= avg ? "price is above" : "price is below"} by ${Math.abs((last / avg - 1) * 100).toFixed(1)}%`, tone: (last >= avg ? "up" : "down") as "up" | "down" });

export function InsightsPage() {
  const listsMs = useRefreshMs("lists");
  const mov = useApi<Movers>("/api/market/movers?exchange=NSE", { refreshMs: listsMs });
  const list = useApi<MarketList>("/api/market/list?exchange=NSE&scope=tracked&pageSize=100&sort=symbol", { refreshMs: listsMs });
  const idx = useApi<IndicesPayload>("/api/market/indices", { refreshMs: listsMs });
  const hist = useApi<History>(`/api/stocks/history?symbol=${encodeURIComponent("NSE:NIFTY 50")}&range=1Y`);

  const quotes = useMemo(() => (list.data?.rows ?? []).map((r) => r.quote).filter((q) => q != null), [list.data]);
  const nifty = idx.data?.indices.find((q) => q.key === "NSE:NIFTY 50");
  const vix = idx.data?.indices.find((q) => q.key === "NSE:INDIA VIX");
  const trend = useMemo(() => (hist.data ? trendStats(hist.data.candles) : null), [hist.data]);
  const ranges = useMemo(() => dayRanges(quotes), [quotes]);
  const rel = useMemo(() => relativePerformance(quotes, nifty?.changePct ?? null), [quotes, nifty?.changePct]);
  const vol = useMemo(() => volumeStats(quotes), [quotes]);
  const m = mov.data;
  const notes = useMemo(
    () => readings({ breadth: m?.breadth, sectors: m?.sectors, trend, ranges, volume: vol, vix: vix?.price ?? null, universeLabel: m?.universeLabel, open: idx.data?.status.open }),
    [m, trend, ranges, vol, vix?.price, idx.data?.status.open],
  );
  const distribution = useMemo(() => {
    const edges = [-Infinity, -3, -2, -1, 0, 1, 2, 3, Infinity];
    const labels = ["< −3%", "−3 to −2", "−2 to −1", "−1 to 0", "0 to 1", "1 to 2", "2 to 3", "> 3%"];
    const counts = labels.map((label, i) => ({ label, count: 0, up: i >= 4 }));
    for (const q of quotes) {
      if (q.changePct == null) continue;
      const i = edges.findIndex((e, k) => q.changePct! >= e && q.changePct! < edges[k + 1]);
      if (i >= 0) counts[i].count++;
    }
    return counts;
  }, [quotes]);
  const label = m?.universeLabel ?? "Tradyn 100";

  return (
    <>
      <PageHeader icon={Activity} title="Market Insights" description={<>Figures calculated from retrieved prices. Cards marked <span className="font-medium text-info">Measured</span> are arithmetic on the data; the <span className="font-medium text-sim">Generated reading</span> is a rule-based summary of them.</>} />
      <FallbackNotice meta={mov.meta ?? list.meta} className="mb-4" />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <Head icon={PieChart} tone="info" title="Market breadth">How many shares rose and fell · {label}</Head>
          <CardContent>
            {mov.error && !m ? <ErrorPanel error={mov.error} onRetry={mov.reload} compact /> : !m ? <RowsSkeleton rows={4} /> : (
              <>
                <BreadthBar breadth={m.breadth} />
                <dl className="mt-4 grid grid-cols-2 gap-2.5">
                  <Fact label="Advance ÷ decline" value={m.breadth.declines ? (m.breadth.advances / m.breadth.declines).toFixed(2) : m.breadth.advances ? "all up" : "—"} sub="above 1 means more shares rose" />
                  <Fact label="Shares priced" value={`${m.breadth.priced} / ${m.breadth.universe}`} sub="unpriced shares are left out" />
                </dl>
                <div className="mt-4 h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={distribution} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} interval={0} angle={-30} textAnchor="end" height={44} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: "var(--surface-2)" }} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--foreground)" }} formatter={(v) => [`${v} shares`, "Day change"]} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                        {distribution.map((d) => <Cell key={d.label} fill={d.up ? "var(--up)" : "var(--down)"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-1 text-center text-[11px] text-faint">Number of shares by size of today&apos;s move</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <Head icon={BarChart3} tone="brand" title="Sector performance">Equal-weighted average day change · {label}</Head>
          <CardContent>
            {mov.error && !m ? <ErrorPanel error={mov.error} onRetry={mov.reload} compact /> : !m ? <RowsSkeleton rows={9} /> : <SectorBars sectors={m.sectors} />}
            <SourceLine meta={mov.meta} className="mt-3 border-t pt-3" />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <Head icon={TrendingUp} tone="up" title="Market trend — Nifty 50">Daily closes for the last year, with moving averages</Head>
          <CardContent>
            {hist.error && !hist.data ? <ErrorPanel error={hist.error} onRetry={hist.reload} compact /> : !trend ? (hist.data ? <p className="py-6 text-center text-[13px] text-muted">The source returned no daily history for the Nifty 50.</p> : <RowsSkeleton rows={4} />) : (
              <>
                <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <Fact label="1 month" value={fmtPct(trend.ret1m)} tone={trend.ret1m == null ? undefined : trend.ret1m >= 0 ? "up" : "down"} sub="21 sessions" />
                  <Fact label="3 months" value={fmtPct(trend.ret3m)} tone={trend.ret3m == null ? undefined : trend.ret3m >= 0 ? "up" : "down"} sub="63 sessions" />
                  <Fact label="1 year" value={fmtPct(trend.ret1y)} tone={trend.ret1y == null ? undefined : trend.ret1y >= 0 ? "up" : "down"} sub={`${trend.sessions} sessions retrieved`} />
                  <Fact label="20-day average" {...vsAvg(trend.last, trend.sma20)} />
                  <Fact label="50-day average" {...vsAvg(trend.last, trend.sma50)} />
                  <Fact label="200-day average" {...vsAvg(trend.last, trend.sma200)} />
                </dl>
                <p className="mt-3 text-[13px] text-muted">
                  Period high <span className="num text-foreground">{fmtPrice(trend.high)}</span>, low <span className="num text-foreground">{fmtPrice(trend.low)}</span>; last close is <span className="num text-foreground">{trend.offHighPct.toFixed(1)}%</span> below the high.{" "}
                  <Link href={keyToPath("NSE:NIFTY 50")} className="font-medium text-foreground underline underline-offset-2">Open the chart</Link>
                </p>
                <SourceLine meta={hist.meta} className="mt-3 border-t pt-3" />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <Head icon={Gauge} tone="warn" title="Volatility">How much prices are swinging</Head>
          <CardContent>
            <dl className="grid grid-cols-2 gap-2.5">
              <Fact label="India VIX" value={vix ? fmtPrice(vix.price) : "—"} sub={vix ? (vix.changePct != null ? `${fmtPct(vix.changePct)} today` : "from the index feed") : "not provided by this source"} />
              <Fact label="Average day range" value={ranges.average != null ? ranges.average.toFixed(2) + "%" : "—"} sub={`(high − low) ÷ prev close, ${ranges.counted} shares`} />
              <Fact label="Nifty, 20 sessions" value={trend?.vol20 != null ? trend.vol20.toFixed(1) + "%" : "—"} sub="annualised daily swings" />
              <Fact label="Nifty, 60 sessions" value={trend?.vol60 != null ? trend.vol60.toFixed(1) + "%" : "—"} sub="annualised daily swings" />
            </dl>
            {ranges.widest.length ? (
              <>
                <p className="mb-1 mt-4 text-xs font-medium text-muted">Widest day ranges</p>
                <ul className="-mx-2">
                  {ranges.widest.slice(0, 5).map((r) => (
                    <li key={r.quote.key}>
                      <Link href={keyToPath(r.quote.key)} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                        <span className="truncate font-medium">{r.quote.symbol}</span>
                        <span className="num text-[13px] text-muted">{r.rangePct.toFixed(2)}%</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <Head icon={Scale} tone="brand" title="Relative performance">Day change minus the Nifty 50&apos;s{nifty?.changePct != null ? ` (${fmtPct(nifty.changePct)})` : ""}</Head>
          <CardContent>
            {list.error && !list.data ? <ErrorPanel error={list.error} onRetry={list.reload} compact /> : !list.data || !idx.data ? <RowsSkeleton rows={8} /> : !rel.leaders.length && !rel.laggards.length ? (
              <p className="py-6 text-center text-[13px] text-muted">Needs the Nifty 50&apos;s day change and share prices; the source did not provide them.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {([["Ahead of the index", rel.leaders], ["Behind the index", rel.laggards]] as const).map(([title, rows]) => (
                  <div key={title}>
                    <p className="mb-1 text-xs font-medium text-muted">{title}</p>
                    <ul className="-mx-2">
                      {rows.slice(0, 5).map((r) => (
                        <li key={r.quote.key}>
                          <Link href={keyToPath(r.quote.key)} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                            <span className="truncate font-medium">{r.quote.symbol}</span>
                            <span className={cn("num text-[13px] font-medium", r.relative >= 0 ? "text-up" : "text-down")}>{(r.relative >= 0 ? "+" : "−") + Math.abs(r.relative).toFixed(2)} pts</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <Head icon={Waves} tone="info" title="Volume analysis">Shares traded today · {label}</Head>
          <CardContent>
            {!list.data ? (list.error ? <ErrorPanel error={list.error} onRetry={list.reload} compact /> : <RowsSkeleton rows={8} />) : !vol.counted ? <p className="py-6 text-center text-[13px] text-muted">The source sent no volume figures.</p> : (
              <>
                <dl className="grid grid-cols-2 gap-2.5">
                  <Fact label="Volume counted" value={fmtVolume(vol.total)} sub={`${vol.counted} shares`} />
                  <Fact label="In rising shares" value={vol.upVolumePct != null ? vol.upVolumePct.toFixed(0) + "%" : "—"} sub="share of volume" tone={vol.upVolumePct == null ? undefined : vol.upVolumePct >= 50 ? "up" : "down"} />
                </dl>
                <p className="mb-1 mt-4 text-xs font-medium text-muted">Busiest shares{vol.top10SharePct != null ? ` · top ten = ${vol.top10SharePct.toFixed(0)}% of volume` : ""}</p>
                <ol className="-mx-2">{vol.top.slice(0, 5).map((q, i) => <QuoteRow key={q.key} quote={q} extra="volume" rank={i + 1} />)}</ol>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-sim/30 xl:col-span-1">
          <CardHeader>
            <div className="group/tile flex items-center gap-2.5">
              <IconTile icon={Sparkles} tone="sim" size="sm" />
              <div>
                <CardTitle>Generated reading</CardTitle>
                <CardDescription>Written by fixed rules from the measured figures</CardDescription>
              </div>
            </div>
            <Badge tone="sim">Generated</Badge>
          </CardHeader>
          <CardContent>
            {notes.length ? (
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li key={n.topic} className="text-[13px] leading-6">
                    <span className="mr-1.5 font-semibold">{n.topic}.</span>
                    <span className="text-muted">{n.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-[13px] text-muted">A reading appears once prices have loaded.</p>
            )}
            <p className="mt-4 border-t pt-3 text-xs leading-5 text-faint">
              These sentences only restate today&apos;s figures. They are not predictions, not investment advice, and say nothing about future returns.
            </p>
          </CardContent>
        </Card>
      </div>
      {nifty ? <p className="sr-only">Nifty 50 <Delta change={nifty.change} pct={nifty.changePct} /></p> : null}
    </>
  );
}
