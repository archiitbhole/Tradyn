"use client";
import { Compass, Grid2x2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { FallbackNotice, SourceLine } from "@/components/shared/source";
import { ErrorPanel } from "@/components/shared/states";
import { StockSearch } from "@/components/shared/stock-search";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { SECTORS } from "@/data/tracked";
import { useApi } from "@/hooks/use-api";
import { useRefreshMs } from "@/hooks/use-market";
import { cn } from "@/lib/utils/cn";
import { fmtPct, fmtPrice, keyToPath } from "@/lib/utils/format";
import type { Exchange, MarketList, MarketRow } from "@/types/market";

/** Background strength follows the size of the move (capped at 3%), so big movers stand out. */
function tileStyle(pct: number | null | undefined): React.CSSProperties {
  if (pct == null) return {};
  const strength = Math.min(1, Math.abs(pct) / 3);
  const color = pct > 0 ? "var(--up)" : pct < 0 ? "var(--down)" : "var(--faint)";
  return { background: `color-mix(in srgb, ${color} ${Math.round(8 + strength * 26)}%, var(--surface))`, borderColor: `color-mix(in srgb, ${color} ${Math.round(18 + strength * 40)}%, var(--border))` };
}

function Tile({ row }: { row: MarketRow }) {
  const { instrument: ins, quote } = row;
  return (
    <Link
      href={keyToPath(ins.key)}
      style={tileStyle(quote?.changePct)}
      title={`${ins.name}${quote ? ` · ₹${fmtPrice(quote.price)}` : " · no price from this source"}`}
      className="flex min-h-[68px] flex-col justify-between rounded-xl border bg-surface p-2.5 transition-transform hover:-translate-y-0.5 hover:shadow-card"
    >
      <span className="truncate text-[13px] font-semibold">{ins.symbol}</span>
      <span className="flex items-end justify-between gap-2">
        <span className="num text-xs text-muted">{quote ? fmtPrice(quote.price) : "—"}</span>
        <span className={cn("num text-xs font-semibold", quote?.changePct == null ? "text-faint" : quote.changePct > 0 ? "text-up" : quote.changePct < 0 ? "text-down" : "text-muted")}>{fmtPct(quote?.changePct)}</span>
      </span>
    </Link>
  );
}

export function Explorer() {
  const router = useRouter();
  const [exchange, setExchange] = useState<Exchange>("NSE");
  const [sector, setSector] = useState<string>("all");
  const refresh = useRefreshMs("lists");
  const { data, meta, error, reload } = useApi<MarketList>(`/api/market/list?exchange=${exchange}&scope=tracked&pageSize=100&sort=symbol`, { refreshMs: refresh });
  const groups = useMemo(() => {
    const by = new Map<string, MarketRow[]>();
    for (const r of data?.rows ?? []) {
      const s = r.instrument.sector ?? "Other";
      if (sector !== "all" && s !== sector) continue;
      by.set(s, [...(by.get(s) ?? []), r]);
    }
    return Array.from(by, ([name, rows]) => {
      const priced = rows.filter((r) => r.quote?.changePct != null);
      rows.sort((a, b) => (b.quote?.changePct ?? -Infinity) - (a.quote?.changePct ?? -Infinity));
      return { name, rows, avg: priced.length ? priced.reduce((s, r) => s + (r.quote!.changePct as number), 0) / priced.length : null };
    }).sort((a, b) => (b.avg ?? -Infinity) - (a.avg ?? -Infinity));
  }, [data, sector]);

  return (
    <>
      <PageHeader icon={Compass} title="Stock Explorer" description="Search any listed share, or browse the Tradyn 100 by sector. Colour shows today's move." />
      <Card className="mb-4 overflow-visible">
        <CardContent className="pt-5">
          <StockSearch onPick={(ins) => router.push(keyToPath(ins.key))} />
        </CardContent>
      </Card>
      <FallbackNotice meta={meta} className="mb-4" />
      <Card>
        <CardHeader>
          <div className="group/tile flex items-center gap-2.5">
            <IconTile icon={Grid2x2} tone="brand" size="sm" />
            <div>
              <CardTitle>Sector map</CardTitle>
              <CardDescription>Tradyn 100 on {exchange} · sectors ordered by average move, shares by their own move</CardDescription>
            </div>
          </div>
          <Segmented label="Exchange" size="sm" value={exchange} onChange={setExchange} options={[{ value: "NSE", label: "NSE" }, { value: "BSE", label: "BSE" }]} />
        </CardHeader>
        <CardContent>
          <div className="scroll-thin -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Sector">
            {["all", ...SECTORS].map((s) => (
              <button key={s} type="button" aria-pressed={sector === s} onClick={() => setSector(s)} className={cn("h-8 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-colors", sector === s ? "border-brand/50 bg-brand-soft text-foreground" : "bg-surface-2 text-muted hover:text-foreground")}>
                {s === "all" ? "All sectors" : s}
              </button>
            ))}
          </div>
          {error && !data ? (
            <ErrorPanel error={error} onRetry={reload} />
          ) : !data ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">{Array.from({ length: 18 }, (_, i) => <Skeleton key={i} className="h-[68px] rounded-xl" />)}</div>
          ) : (
            <div className="space-y-5">
              {groups.map((g) => (
                <section key={g.name} aria-label={g.name}>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-semibold">
                      <Link href={`/markets?sector=${encodeURIComponent(g.name)}`} className="hover:text-brand">{g.name}</Link>
                      <span className="ml-2 text-xs font-normal text-muted">{g.rows.length} shares</span>
                    </h3>
                    <span className={cn("num text-[13px] font-medium", g.avg == null ? "text-faint" : g.avg >= 0 ? "text-up" : "text-down")}>{g.avg == null ? "no prices" : `avg ${fmtPct(g.avg)}`}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
                    {g.rows.map((r) => <Tile key={r.instrument.key} row={r} />)}
                  </div>
                </section>
              ))}
              <div className="space-y-1 border-t pt-3">
                <SourceLine meta={meta} />
                {data.note ? <p className="text-xs text-warn">{data.note}</p> : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
