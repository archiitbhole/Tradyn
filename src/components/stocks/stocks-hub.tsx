"use client";
import { Clock3, LineChart, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Delta } from "@/components/shared/delta";
import { PageHeader } from "@/components/shared/page-header";
import { FallbackNotice, SourceLine } from "@/components/shared/source";
import { EmptyState } from "@/components/shared/states";
import { StockSearch } from "@/components/shared/stock-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { INDICES, TRACKED } from "@/data/tracked";
import { useApi } from "@/hooks/use-api";
import { useRefreshMs } from "@/hooks/use-market";
import { useMounted } from "@/hooks/use-mounted";
import { useRecent } from "@/hooks/use-recent";
import { fmtPrice, keyToPath } from "@/lib/utils/format";
import type { Quote } from "@/types/market";

const POPULAR = ["RELIANCE", "HDFCBANK", "TCS", "INFY", "ICICIBANK", "SBIN", "BHARTIARTL", "ITC", "LT", "MARUTI", "SUNPHARMA", "TATASTEEL"];

/** "Stock Details" landing page: find a share, or reopen one you looked at recently. */
export function StocksHub() {
  const router = useRouter();
  const mounted = useMounted();
  const { recent, clear } = useRecent();
  const refresh = useRefreshMs("quotes");
  const keys = mounted ? recent.slice(0, 12).map((r) => r.key) : [];
  const { data, meta } = useApi<{ quotes: Quote[] }>(keys.length ? `/api/stocks/quotes?symbols=${encodeURIComponent(keys.join(","))}` : null, { refreshMs: refresh });
  const byKey = new Map(data?.quotes.map((q) => [q.key, q]));
  const popular = POPULAR.map((s) => TRACKED.find(([sym]) => sym === s)).filter((x): x is (typeof TRACKED)[number] => !!x);

  return (
    <>
      <PageHeader icon={LineChart} title="Stock Details" description="Open any NSE or BSE share or index to see its quote, chart and price history." />
      <Card className="mb-4 overflow-visible">
        <CardContent className="pt-5">
          <StockSearch autoFocus onPick={(ins) => router.push(keyToPath(ins.key))} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Indices:</span>
            {INDICES.map((i) => (
              <Link key={i.symbol} href={keyToPath(`${i.exchange}:${i.symbol}`)} className="rounded-full border bg-surface-2 px-3 py-1 text-xs font-medium transition-colors hover:border-brand/50 hover:text-brand">
                {i.name}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="group/tile flex items-center gap-2.5">
              <IconTile icon={Clock3} tone="info" size="sm" />
              <div>
                <CardTitle>Recently viewed</CardTitle>
                <CardDescription>Kept in this browser</CardDescription>
              </div>
            </div>
            {keys.length ? <Button size="sm" variant="ghost" onClick={clear}><Trash2 /> Clear</Button> : null}
          </CardHeader>
          <CardContent>
            <FallbackNotice meta={meta} className="mb-3" />
            {!keys.length ? (
              <EmptyState icon={Search} tone="neutral" title="Nothing viewed yet" className="py-8">Shares you open will be listed here so you can get back to them quickly.</EmptyState>
            ) : (
              <>
                <ul className="-mx-2">
                  {recent.slice(0, 12).map((r) => {
                    const q = byKey.get(r.key);
                    return (
                      <li key={r.key}>
                        <Link href={keyToPath(r.key)} className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2">
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2"><span className="truncate text-sm font-medium group-hover:text-brand">{r.symbol}</span><Badge>{r.exchange}</Badge></span>
                            <span className="block truncate text-xs text-muted">{r.name}</span>
                          </span>
                          {q ? (
                            <span className="text-right">
                              <span className="num block text-sm font-medium">{fmtPrice(q.price)}</span>
                              <Delta pct={q.changePct} showChange={false} className="text-xs" />
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <SourceLine meta={meta} className="mt-3 border-t pt-3" />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Widely followed shares</CardTitle>
              <CardDescription>A starting point — large NSE companies</CardDescription>
            </div>
            <Button size="sm" variant="ghost" asChild><Link href="/explorer">Explore all</Link></Button>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {popular.map(([symbol, name, sector]) => (
                <li key={symbol}>
                  <Link href={keyToPath(`NSE:${symbol}`)} className="group flex items-center justify-between gap-3 rounded-xl border bg-surface-2/40 px-3 py-2.5 transition-colors hover:border-brand/40 hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium group-hover:text-brand">{symbol}</span>
                      <span className="block truncate text-xs text-muted">{name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-faint">{sector}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
