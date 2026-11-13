"use client";
import Link from "next/link";
import { Sparkline } from "@/components/charts/sparkline";
import { Delta } from "@/components/shared/delta";
import { FreshnessBadge } from "@/components/shared/source";
import { Card } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import { useRefreshMs } from "@/hooks/use-market";
import { fmtPrice, fmtTime, keyToPath, trend } from "@/lib/utils/format";
import type { History, Quote } from "@/types/market";

export function IndexCard({ quote }: { quote: Quote }) {
  const refresh = useRefreshMs("charts");
  const { data: history } = useApi<History>(`/api/stocks/history?symbol=${encodeURIComponent(quote.key)}&range=1D`, { refreshMs: refresh });
  const closes = history?.candles.map((c) => c.close) ?? [];
  return (
    <Card className="group relative overflow-hidden transition-[border-color,transform] hover:-translate-y-0.5 hover:border-border-strong">
      <Link href={keyToPath(quote.key)} className="block p-4" aria-label={`${quote.name}: ${fmtPrice(quote.price)}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-muted">{quote.name}</p>
            <p className="num mt-1 text-2xl font-semibold tracking-tight">{fmtPrice(quote.price)}</p>
          </div>
          <FreshnessBadge freshness={quote.freshness} />
        </div>
        <div className="mt-1.5 flex items-end justify-between gap-3">
          <Delta change={quote.change} pct={quote.changePct} className="text-[13px]" />
        </div>
        <Sparkline values={closes} baseline={quote.prevClose} tone={trend(quote.changePct)} className="mt-2" />
        <p className="mt-1.5 truncate text-[11px] text-faint">{quote.source} · {fmtTime(quote.ts)}</p>
      </Link>
    </Card>
  );
}
