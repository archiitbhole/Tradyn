"use client";
import { ArrowDown, ArrowUp, ArrowUpDown, CandlestickChart, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Delta } from "@/components/shared/delta";
import { PageHeader } from "@/components/shared/page-header";
import { FallbackNotice, SourceLine } from "@/components/shared/source";
import { EmptyState, ErrorPanel } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { WatchToggle } from "@/components/watchlist/watch-toggle";
import { SECTORS } from "@/data/tracked";
import { useApi } from "@/hooks/use-api";
import { useRefreshMs } from "@/hooks/use-market";
import { cn } from "@/lib/utils/cn";
import { fmtChange, fmtInt, fmtPrice, fmtVolume, keyToPath, trend } from "@/lib/utils/format";
import type { Exchange, MarketList, SortKey } from "@/types/market";

const COLUMNS: { key: SortKey; label: string; numeric: boolean; hide?: string }[] = [
  { key: "symbol", label: "Share", numeric: false },
  { key: "price", label: "Last price", numeric: true },
  { key: "change", label: "Change", numeric: true, hide: "hidden md:table-cell" },
  { key: "changePct", label: "Change %", numeric: true },
  { key: "volume", label: "Volume", numeric: true, hide: "hidden sm:table-cell" },
  { key: "high", label: "Day high", numeric: true, hide: "hidden lg:table-cell" },
  { key: "low", label: "Day low", numeric: true, hide: "hidden lg:table-cell" },
  { key: "prevClose", label: "Prev close", numeric: true, hide: "hidden xl:table-cell" },
];
const PAGE_SIZES = [25, 50, 100] as const;

export function MarketsTable() {
  const router = useRouter();
  const sp = useSearchParams();
  const [exchange, setExchange] = useState<Exchange>(sp.get("exchange") === "BSE" ? "BSE" : "NSE");
  const [scope, setScope] = useState<"tracked" | "all">(sp.get("scope") === "all" ? "all" : "tracked");
  const [sector, setSector] = useState(sp.get("sector") ?? "");
  const [text, setText] = useState(sp.get("q") ?? "");
  const [q, setQ] = useState(text);
  const [sort, setSort] = useState<SortKey>((sp.get("sort") as SortKey) || "changePct");
  const [dir, setDir] = useState<"asc" | "desc">(sp.get("dir") === "asc" ? "asc" : "desc");
  const [page, setPage] = useState(Math.max(1, Number(sp.get("page")) || 1));
  const [pageSize, setPageSize] = useState<number>(25);
  const refresh = useRefreshMs("lists");

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(text.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [text]);

  const effSort: SortKey = scope === "all" && sort !== "symbol" && sort !== "name" ? "symbol" : sort;
  const effDir = scope === "all" && effSort !== sort ? "asc" : dir;
  const query = useMemo(() => {
    const p = new URLSearchParams({ exchange, scope, sort: effSort, dir: effDir, page: String(page), pageSize: String(pageSize) });
    if (q) p.set("q", q);
    if (sector && scope === "tracked") p.set("sector", sector);
    return p.toString();
  }, [exchange, scope, effSort, effDir, page, pageSize, q, sector]);

  // keep the address in step, so a filtered view can be bookmarked and Back works
  useEffect(() => {
    const p = new URLSearchParams(query);
    p.delete("pageSize");
    if (p.get("page") === "1") p.delete("page");
    router.replace(`/markets?${p}`, { scroll: false });
  }, [query, router]);

  const { data, meta, error, loading, refreshing, reload } = useApi<MarketList>(`/api/market/list?${query}`, { refreshMs: refresh });
  const sortable = new Set(data?.sortable ?? ["symbol", "name"]);

  const onSort = (key: SortKey) => {
    if (!sortable.has(key)) return;
    if (key === sort) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(key);
      setDir(key === "symbol" ? "asc" : "desc");
    }
    setPage(1);
  };
  const reset = () => {
    setText("");
    setSector("");
    setPage(1);
  };

  return (
    <>
      <PageHeader icon={CandlestickChart} title="Markets" description="Every share on NSE and BSE. Prices come from the configured data source; a dash means the source sent no value." />
      <FallbackNotice meta={meta} className="mb-4" />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b p-3 sm:p-4">
          <Segmented label="Exchange" value={exchange} onChange={(v) => { setExchange(v); setPage(1); }} options={[{ value: "NSE", label: "NSE" }, { value: "BSE", label: "BSE" }]} />
          <Segmented
            label="Which shares"
            value={scope}
            onChange={(v) => { setScope(v); setPage(1); }}
            options={[{ value: "tracked", label: "Tradyn 100", title: "About a hundred large companies, all priced — sortable by any column" }, { value: "all", label: "All shares", title: "Every listed share, by name; the page on screen is priced" }]}
          />
          {scope === "tracked" ? (
            <Select label="Sector" value={sector || "all"} onValueChange={(v) => { setSector(v === "all" ? "" : v); setPage(1); }} options={[{ value: "all", label: "All sectors" }, ...SECTORS.map((s) => ({ value: s, label: s }))]} className="min-w-[150px]" />
          ) : null}
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Filter by symbol or name" aria-label="Filter by symbol or name" className="pl-9 pr-8" />
            {text ? (
              <button type="button" onClick={() => setText("")} aria-label="Clear filter" className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground">
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
          <span className="ml-auto text-xs text-muted" aria-live="polite">{data ? `${fmtInt(data.total)} share${data.total === 1 ? "" : "s"}` : ""}{refreshing && data ? " · updating" : ""}</span>
        </div>

        {error && !data ? (
          <ErrorPanel error={error} onRetry={reload} />
        ) : data && !data.rows.length ? (
          <EmptyState icon={Search} title="No shares match" action={<Button size="sm" onClick={reset}>Clear filters</Button>}>
            {q ? <>Nothing on {exchange} matches “{q}”{scope === "tracked" ? " in the Tradyn 100. Try All shares." : "."}</> : "Try another sector or exchange."}
          </EmptyState>
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[360px] border-collapse text-sm">
              <caption className="sr-only">Shares on {exchange}</caption>
              <thead>
                <tr className="border-b text-xs text-muted">
                  {COLUMNS.map((c) => {
                    const can = sortable.has(c.key);
                    const on = effSort === c.key || (c.key === "symbol" && effSort === "name");
                    const Icon = !on ? ArrowUpDown : effDir === "asc" ? ArrowUp : ArrowDown;
                    return (
                      <th key={c.key} scope="col" aria-sort={on ? (effDir === "asc" ? "ascending" : "descending") : undefined} className={cn("whitespace-nowrap px-3 py-2.5 font-medium first:pl-4 sm:first:pl-5", c.numeric ? "text-right" : "text-left", c.hide)}>
                        {can ? (
                          <button type="button" onClick={() => onSort(c.key)} className={cn("inline-flex items-center gap-1 rounded-md transition-colors hover:text-foreground", on && "text-foreground", c.numeric && "flex-row-reverse")}>
                            {c.label}
                            <Icon className={cn("size-3.5", !on && "opacity-50")} aria-hidden />
                          </button>
                        ) : (
                          <span title="Sorting by this column needs every row priced — choose Tradyn 100">{c.label}</span>
                        )}
                      </th>
                    );
                  })}
                  <th scope="col" className="w-10 px-2 py-2.5"><span className="sr-only">Watchlist</span></th>
                </tr>
              </thead>
              <tbody>
                {!data
                  ? Array.from({ length: 12 }, (_, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-4 py-3 sm:pl-5"><Skeleton className="h-4 w-28" /><Skeleton className="mt-1.5 h-3 w-40" /></td>
                        <td className="px-3" colSpan={COLUMNS.length}><Skeleton className="ml-auto h-4 w-2/3" /></td>
                      </tr>
                    ))
                  : data.rows.map(({ instrument: ins, quote: qt }) => {
                      const t = trend(qt?.changePct);
                      return (
                        <tr key={ins.key} className="group border-b transition-colors last:border-0 hover:bg-surface-2/60">
                          <th scope="row" className="max-w-[46vw] px-3 py-2.5 pl-4 text-left font-normal sm:max-w-none sm:pl-5">
                            <Link href={keyToPath(ins.key)} className="block">
                              <span className="block truncate font-medium group-hover:text-brand">{ins.symbol}</span>
                              <span className="block truncate text-xs text-muted">{ins.name}{ins.sector ? ` · ${ins.sector}` : ""}</span>
                            </Link>
                          </th>
                          <td className="num px-3 py-2.5 text-right font-medium">{fmtPrice(qt?.price)}</td>
                          <td className={cn("num hidden px-3 py-2.5 text-right md:table-cell", t === "up" ? "text-up" : t === "down" ? "text-down" : "text-muted")}>{fmtChange(qt?.change)}</td>
                          <td className="px-3 py-2.5 text-right">{qt ? <Delta pct={qt.changePct} showChange={false} pill className="text-[13px]" /> : <span className="num text-faint">—</span>}</td>
                          <td className="num hidden px-3 py-2.5 text-right text-muted sm:table-cell">{fmtVolume(qt?.volume)}</td>
                          <td className="num hidden px-3 py-2.5 text-right text-muted lg:table-cell">{fmtPrice(qt?.high)}</td>
                          <td className="num hidden px-3 py-2.5 text-right text-muted lg:table-cell">{fmtPrice(qt?.low)}</td>
                          <td className="num hidden px-3 py-2.5 text-right text-muted xl:table-cell">{fmtPrice(qt?.prevClose)}</td>
                          <td className="px-2 py-1.5 text-right"><WatchToggle item={{ key: ins.key, symbol: ins.symbol, name: ins.name, exchange: ins.exchange, kind: ins.kind }} /></td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3 sm:px-5">
          <div className="space-y-1">
            <SourceLine meta={meta} />
            {data?.note ? <p className="text-xs text-warn">{data.note}</p> : null}
            {scope === "all" ? <p className="text-xs text-faint">All shares are listed by name; only the page on screen is priced. Use Tradyn 100 to sort by price, change or volume.</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <Select label="Rows per page" value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }} options={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} rows` }))} />
            <Button size="icon" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}><ChevronLeft /></Button>
            <span className="num min-w-[84px] text-center text-[13px] text-muted">Page {page} of {data?.pages ?? "…"}</span>
            <Button size="icon" aria-label="Next page" disabled={!data || page >= data.pages || loading} onClick={() => setPage(page + 1)}><ChevronRight /></Button>
          </div>
        </div>
      </Card>
    </>
  );
}
