"use client";
import { BarChart3, Flame, LayoutDashboard, PieChart, Star, TrendingDown, TrendingUp, Waves } from "lucide-react";
import Link from "next/link";
import { SectorBars } from "@/components/charts/sector-bars";
import { Delta } from "@/components/shared/delta";
import { PageHeader } from "@/components/shared/page-header";
import { QuoteRow } from "@/components/shared/quote-row";
import { FallbackNotice, SourceLine } from "@/components/shared/source";
import { EmptyState, ErrorPanel, RowsSkeleton } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/hooks/use-api";
import { useRefreshMs } from "@/hooks/use-market";
import { useWatchlists } from "@/hooks/use-watchlists";
import { fmtPct, fmtPrice, keyToPath } from "@/lib/utils/format";
import type { IndicesPayload, Movers, Quote } from "@/types/market";
import { BreadthBar } from "./breadth-bar";
import { IndexCard } from "./index-card";

const HEADLINE = ["NSE:NIFTY 50", "BSE:SENSEX", "NSE:NIFTY BANK"];

function WatchlistPreview() {
  const wl = useWatchlists();
  const first = wl.lists.find((l) => l.items.length) ?? wl.lists[0];
  const keys = first?.items.slice(0, 6).map((i) => i.key) ?? [];
  const refresh = useRefreshMs("quotes");
  const { data, error } = useApi<{ quotes: Quote[] }>(keys.length ? `/api/stocks/quotes?symbols=${encodeURIComponent(keys.join(","))}` : null, { refreshMs: refresh });
  const byKey = new Map(data?.quotes.map((q) => [q.key, q]));
  return (
    <Card>
      <CardHeader>
        <div className="group/tile flex items-center gap-2.5">
          <IconTile icon={Star} tone="brand" size="sm" />
          <CardTitle>{first?.name ?? "Watchlist"}</CardTitle>
        </div>
        <Button size="sm" variant="ghost" asChild><Link href="/watchlist">Open</Link></Button>
      </CardHeader>
      <CardContent>
        {wl.loading ? (
          <RowsSkeleton rows={4} />
        ) : !keys.length ? (
          <EmptyState icon={Star} title="Your watchlist is empty" className="py-6" action={<Button size="sm" variant="primary" asChild><Link href="/watchlist">Add shares</Link></Button>}>
            Add the shares you follow to see their prices here.
          </EmptyState>
        ) : (
          <ul className="-mx-2">
            {first!.items.slice(0, 6).map((it) => {
              const q = byKey.get(it.key);
              return q ? (
                <QuoteRow key={it.key} quote={q} />
              ) : (
                <li key={it.key}>
                  <Link href={keyToPath(it.key)} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{it.symbol}</span>
                      <span className="block truncate text-xs text-muted">{it.name}</span>
                    </span>
                    {data || error ? <span className="text-xs text-faint">No price</span> : <Skeleton className="h-4 w-16" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function Overview() {
  const quotesMs = useRefreshMs("quotes");
  const listsMs = useRefreshMs("lists");
  const idx = useApi<IndicesPayload>("/api/market/indices", { refreshMs: quotesMs });
  const mov = useApi<Movers>("/api/market/movers?exchange=NSE", { refreshMs: listsMs });
  const headline = HEADLINE.map((k) => idx.data?.indices.find((q) => q.key === k)).filter((q): q is Quote => !!q);
  const nifty = headline.find((q) => q.key === "NSE:NIFTY 50");
  const vix = idx.data?.indices.find((q) => q.key === "NSE:INDIA VIX");
  const m = mov.data;
  const avg = m && m.sectors.length ? m.sectors.reduce((s, x) => s + x.changePct * x.count, 0) / Math.max(1, m.sectors.reduce((s, x) => s + x.count, 0)) : null;

  return (
    <>
      <PageHeader icon={LayoutDashboard} title="Overview" description="Indian markets at a glance — NSE and BSE." actions={idx.data ? <Badge tone={idx.data.status.open ? "up" : "neutral"}>{idx.data.status.label} · {idx.data.status.nextChange}</Badge> : null} />
      <FallbackNotice meta={idx.meta ?? mov.meta} className="mb-4" />

      <section aria-label="Market indices" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {idx.error && !idx.data ? (
          <Card className="sm:col-span-2 xl:col-span-3"><ErrorPanel error={idx.error} onRetry={idx.reload} compact /></Card>
        ) : headline.length ? (
          headline.map((q) => <IndexCard key={q.key} quote={q} />)
        ) : (
          Array.from({ length: 3 }, (_, i) => <Card key={i} className="p-4"><Skeleton className="h-4 w-24" /><Skeleton className="mt-3 h-7 w-36" /><Skeleton className="mt-3 h-10 w-full" /></Card>)
        )}
      </section>
      {idx.data?.unavailable.length ? <p className="mt-2 text-xs text-faint">Not provided by {idx.meta?.source}: {idx.data.unavailable.join(", ")}.</p> : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="group/tile flex items-center gap-2.5">
              <IconTile icon={PieChart} tone="info" size="sm" />
              <div>
                <CardTitle>Market summary</CardTitle>
                <CardDescription>{m ? `Breadth across the ${m.universeLabel}` : "Advances and declines"}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {mov.error && !m ? (
              <ErrorPanel error={mov.error} onRetry={mov.reload} compact />
            ) : !m ? (
              <RowsSkeleton rows={5} />
            ) : (
              <>
                <BreadthBar breadth={m.breadth} />
                <dl className="mt-4 space-y-2.5 border-t pt-4 text-[13px]">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">Nifty 50 today</dt>
                    <dd>{nifty ? <Delta change={nifty.change} pct={nifty.changePct} /> : <span className="text-faint">—</span>}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">Average move, {m.universeLabel}</dt>
                    <dd>{avg != null ? <Delta pct={avg} showChange={false} /> : <span className="text-faint">—</span>}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">India VIX (expected volatility)</dt>
                    <dd className="num font-medium">{vix ? fmtPrice(vix.price) : <span className="font-sans font-normal text-faint">not provided by this source</span>}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">Shares priced</dt>
                    <dd className="num font-medium">{m.breadth.priced} of {m.breadth.universe}</dd>
                  </div>
                </dl>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="group/tile flex items-center gap-2.5">
              <IconTile icon={BarChart3} tone="brand" size="sm" />
              <div>
                <CardTitle>Sector performance</CardTitle>
                <CardDescription>Average day change of each sector&apos;s shares (equal weight){m ? ` · ${m.universeLabel}` : ""}</CardDescription>
              </div>
            </div>
            <Button size="sm" variant="ghost" asChild><Link href="/insights">Insights</Link></Button>
          </CardHeader>
          <CardContent>
            {mov.error && !m ? <ErrorPanel error={mov.error} onRetry={mov.reload} compact /> : !m ? <RowsSkeleton rows={8} /> : m.sectors.length ? <SectorBars sectors={m.sectors} /> : <p className="py-6 text-center text-[13px] text-muted">No sector figures: the source sent no day changes.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <Tabs defaultValue="gainers">
            <CardHeader>
              <div>
                <CardTitle>Market activity</CardTitle>
                <CardDescription>{m ? `Ranked within the ${m.universeLabel}` : "Top movers"}</CardDescription>
              </div>
              <TabsList className="max-w-full overflow-x-auto">
                <TabsTrigger value="gainers"><TrendingUp /> Gainers</TabsTrigger>
                <TabsTrigger value="losers"><TrendingDown /> Losers</TabsTrigger>
                <TabsTrigger value="active"><Flame /> Most active</TabsTrigger>
                <TabsTrigger value="volume"><Waves /> Highest volume</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              {mov.error && !m ? (
                <ErrorPanel error={mov.error} onRetry={mov.reload} compact />
              ) : !m ? (
                <RowsSkeleton rows={8} />
              ) : (
                <>
                  {([["gainers", m.gainers, undefined, "No share is up right now."], ["losers", m.losers, undefined, "No share is down right now."], ["active", m.mostValue, "value", "The source sent no volume figures."], ["volume", m.mostActive, "volume", "The source sent no volume figures."]] as const).map(([key, rows, extra, empty]) => (
                    <TabsContent key={key} value={key}>
                      {rows.length ? (
                        <ol className="-mx-2 grid gap-x-6 sm:grid-cols-2">{rows.map((q, i) => <QuoteRow key={q.key} quote={q} extra={extra} rank={i + 1} />)}</ol>
                      ) : (
                        <p className="py-8 text-center text-[13px] text-muted">{empty}</p>
                      )}
                      {key === "active" && rows.length ? <p className="mt-2 text-xs text-faint">Value traded is estimated as last price × volume; the sources do not publish exchange turnover.</p> : null}
                    </TabsContent>
                  ))}
                  <SourceLine meta={mov.meta} className="mt-3 border-t pt-3" />
                </>
              )}
            </CardContent>
          </Tabs>
        </Card>
        <WatchlistPreview />
      </div>
      {m && avg != null ? <p className="sr-only">Average move {fmtPct(avg)}</p> : null}
    </>
  );
}
