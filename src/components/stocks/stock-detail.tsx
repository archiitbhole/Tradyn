"use client";
import { ArrowLeftRight, CandlestickChart, ChartLine, ChevronDown, History as HistoryIcon, RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Delta } from "@/components/shared/delta";
import { FallbackNotice, SourceLine } from "@/components/shared/source";
import { EmptyState, ErrorPanel } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { WatchToggle } from "@/components/watchlist/watch-toggle";
import { useApi } from "@/hooks/use-api";
import { useRefreshMs } from "@/hooks/use-market";
import { usePref } from "@/hooks/use-pref";
import { useRecent } from "@/hooks/use-recent";
import { cn } from "@/lib/utils/cn";
import { fmtPct, fmtPrice, fmtVolume, keyToPath } from "@/lib/utils/format";
import { RANGES, type History, type HistoryRange, type Instrument, type Quote } from "@/types/market";

const PriceChart = dynamic(() => import("@/components/charts/price-chart").then((m) => m.PriceChart), { ssr: false, loading: () => <Skeleton className="h-[440px] w-full" /> });

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-surface-2/50 px-3.5 py-3" title={hint}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-1 text-[15px] font-semibold">{value}</dd>
    </div>
  );
}

function DayRange({ quote }: { quote: Quote }) {
  if (quote.low == null || quote.high == null || quote.high <= quote.low) return null;
  const pos = Math.min(100, Math.max(0, ((quote.price - quote.low) / (quote.high - quote.low)) * 100));
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex justify-between text-xs text-muted">
        <span>Day low <span className="num text-foreground">{fmtPrice(quote.low)}</span></span>
        <span>Day high <span className="num text-foreground">{fmtPrice(quote.high)}</span></span>
      </div>
      <div className="relative h-1.5 rounded-full bg-gradient-to-r from-down/50 via-surface-3 to-up/50" role="img" aria-label={`Last price is ${pos.toFixed(0)}% of the way from the day's low to its high`}>
        <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-foreground shadow" style={{ left: `${pos}%` }} />
      </div>
    </div>
  );
}

function dateLabel(time: number, intraday: boolean): string {
  const d = new Date((time + (intraday ? 19_800 : 0)) * 1000);
  return intraday
    ? d.toLocaleString("en-IN", { timeZone: "UTC", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })
    : d.toLocaleDateString("en-IN", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });
}

export function StockDetail({ instrument, twin }: { instrument: Instrument; twin: Instrument | null }) {
  const [range, setRange] = useState<HistoryRange>("1D");
  const [mode, setMode] = usePref<"candles" | "line">("tradyn.chart.mode", "candles");
  const [allRows, setAllRows] = useState(false);
  const quotesMs = useRefreshMs("quotes");
  const chartMs = useRefreshMs("charts");
  const { remember } = useRecent();
  const key = encodeURIComponent(instrument.key);
  const q = useApi<Quote>(`/api/stocks/quote?symbol=${key}`, { refreshMs: quotesMs });
  const h = useApi<History>(`/api/stocks/history?symbol=${key}&range=${range}`, { refreshMs: range === "1D" ? chartMs : 0 });
  const quote = q.data;
  const isIndex = instrument.kind === "INDEX";
  const item = useMemo(() => ({ key: instrument.key, symbol: instrument.symbol, name: instrument.name, exchange: instrument.exchange, kind: instrument.kind }), [instrument]);

  useEffect(() => remember(item), [item, remember]);

  // only show candles that belong to the range being asked for (the previous range stays on screen while loading)
  const history = h.data && h.data.key === instrument.key ? h.data : undefined;
  const stale = history && history.range !== range;
  const candles = useMemo(() => history?.candles ?? [], [history]);
  const prevClose = quote?.prevClose ?? null;
  const period = useMemo(() => {
    if (candles.length < 2) return null;
    const first = range === "1D" && prevClose ? prevClose : candles[0].open;
    const last = candles[candles.length - 1].close;
    return { pct: (last / first - 1) * 100, high: Math.max(...candles.map((c) => c.high)), low: Math.min(...candles.map((c) => c.low)) };
  }, [candles, range, prevClose]);
  const rows = useMemo(() => [...candles].reverse().slice(0, allRows ? 400 : 12), [candles, allRows]);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-[13px] text-muted">
        <Link href="/markets" className="hover:text-foreground">Markets</Link>
        <span className="mx-1.5" aria-hidden>/</span>
        <span className="text-foreground">{instrument.symbol}</span>
      </nav>

      <FallbackNotice meta={q.meta} className="mb-4" />

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{instrument.symbol}</h1>
              <Badge>{instrument.exchange}</Badge>
              {isIndex ? <Badge tone="info">Index</Badge> : null}
              {instrument.sector ? <Badge tone="brand">{instrument.sector}</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-muted">{instrument.name}</p>
            {q.error && !quote ? (
              <div className="mt-3 max-w-xl rounded-xl border bg-surface-2/50"><ErrorPanel error={q.error} onRetry={q.reload} compact /></div>
            ) : quote ? (
              <>
                <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
                  <p className="num text-4xl font-semibold tracking-tight" aria-label={`Last price ${fmtPrice(quote.price)} rupees`}>
                    <span className="mr-1 align-top text-xl font-medium text-muted">{isIndex ? "" : "₹"}</span>
                    {fmtPrice(quote.price)}
                  </p>
                  <Delta change={quote.change} pct={quote.changePct} pill className="mb-1.5 text-sm" />
                </div>
                <SourceLine meta={q.meta} ts={quote.ts} freshness={quote.freshness} className="mt-3" />
              </>
            ) : (
              <div className="mt-3"><Skeleton className="h-10 w-56" /><Skeleton className="mt-3 h-4 w-72" /></div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {twin ? (
              <Button asChild title={`Open ${twin.symbol} on ${twin.exchange}`}>
                <Link href={keyToPath(twin.key)}><ArrowLeftRight /> View on {twin.exchange}</Link>
              </Button>
            ) : null}
            <WatchToggle item={item} withLabel />
          </div>
        </div>
        {quote ? (
          <div className="border-t px-5 pb-5 pt-4">
            <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Previous close" value={fmtPrice(quote.prevClose)} />
              <Stat label="Open" value={fmtPrice(quote.open)} />
              <Stat label="Day high" value={fmtPrice(quote.high)} />
              <Stat label="Day low" value={fmtPrice(quote.low)} />
              <Stat label="Volume" value={isIndex ? "n/a" : fmtVolume(quote.volume)} hint={isIndex ? "An index is not traded itself, so it has no volume" : "Shares traded today"} />
            </dl>
            <DayRange quote={quote} />
          </div>
        ) : null}
      </Card>

      <Card className="mb-4">
        <CardHeader className="gap-y-3">
          <div>
            <CardTitle>Price chart</CardTitle>
            <CardDescription>
              {history ? `${history.interval} candles · ${candles.length} points` : "Loading…"}
              {period && !stale ? <> · this period <span className={cn("num font-medium", period.pct >= 0 ? "text-up" : "text-down")}>{fmtPct(period.pct)}</span>, high <span className="num text-foreground">{fmtPrice(period.high)}</span>, low <span className="num text-foreground">{fmtPrice(period.low)}</span></> : null}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Chart type" size="sm" value={mode} onChange={setMode} options={[{ value: "candles", label: "Candles" }, { value: "line", label: "Line" }]} />
            <Segmented label="Time range" size="sm" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: r }))} />
          </div>
        </CardHeader>
        <CardContent>
          {h.error && !history ? (
            <ErrorPanel error={h.error} onRetry={h.reload} />
          ) : !history ? (
            <Skeleton className="h-[440px] w-full" />
          ) : !candles.length ? (
            <EmptyState icon={mode === "candles" ? CandlestickChart : ChartLine} tone="neutral" title="No price history for this range" action={<Button size="sm" onClick={h.reload}><RefreshCw /> Check again</Button>}>
              {h.meta?.source ?? "The data source"} returned no candles for {instrument.symbol} over {range}. {range === "1D" ? "Before the market opens there is nothing to draw for today." : "Try another range."}
            </EmptyState>
          ) : (
            <div className={cn("transition-opacity", stale && "opacity-50")}>
              <PriceChart candles={candles} intraday={history.intraday} mode={mode} prevClose={range === "1D" ? quote?.prevClose : null} />
            </div>
          )}
          <SourceLine meta={h.meta} className="mt-3 border-t pt-3" />
        </CardContent>
      </Card>

      {candles.length ? (
        <Card>
          <CardHeader>
            <div className="group/tile flex items-center gap-2.5">
              <IconTile icon={HistoryIcon} tone="info" size="sm" />
              <div>
                <CardTitle>Historical data</CardTitle>
                <CardDescription>{history?.interval} candles for {range}, newest first{history?.intraday ? " · India time" : ""}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-y text-xs text-muted">
                  <th scope="col" className="px-5 py-2 text-left font-medium">{history?.intraday ? "Time" : "Date"}</th>
                  {["Open", "High", "Low", "Close", ...(isIndex ? [] : ["Volume"])].map((c) => <th key={c} scope="col" className="px-3 py-2 text-right font-medium last:pr-5">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.time} className="border-b last:border-0 hover:bg-surface-2/60">
                    <th scope="row" className="whitespace-nowrap px-5 py-2 text-left font-normal text-muted">{dateLabel(c.time, !!history?.intraday)}</th>
                    <td className="num px-3 py-2 text-right">{fmtPrice(c.open)}</td>
                    <td className="num px-3 py-2 text-right">{fmtPrice(c.high)}</td>
                    <td className="num px-3 py-2 text-right">{fmtPrice(c.low)}</td>
                    <td className={cn("num px-3 py-2 text-right font-medium", c.close >= c.open ? "text-up" : "text-down", isIndex && "pr-5")}>{fmtPrice(c.close)}</td>
                    {isIndex ? null : <td className="num px-3 py-2 pr-5 text-right text-muted">{fmtVolume(c.volume)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {candles.length > 12 ? (
            <div className="border-t p-3 text-center">
              <Button size="sm" variant="ghost" onClick={() => setAllRows(!allRows)} aria-expanded={allRows}>
                <ChevronDown className={cn("transition-transform", allRows && "rotate-180")} />
                {allRows ? "Show fewer rows" : `Show ${Math.min(400, candles.length)} rows`}
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}
