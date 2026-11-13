"use client";
import { CircleAlert, Clock3, Info, Radio, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";
import { fmtTime } from "@/lib/utils/format";
import type { Freshness, ResponseMeta } from "@/types/market";

const FRESH: Record<Freshness, { label: string; tone: "up" | "warn" | "neutral"; tip: string }> = {
  live: { label: "Live", tone: "up", tip: "From the broker's official feed, traded within the last two minutes." },
  delayed: { label: "Delayed", tone: "warn", tip: "This source does not promise real-time prices; they can lag the exchange." },
  stale: { label: "Stale", tone: "warn", tip: "The market is open but this price has not changed for a while." },
  closed: { label: "Last close", tone: "neutral", tip: "The market is closed. This is the last traded price of the previous session." },
};

export function FreshnessBadge({ freshness, className }: { freshness: Freshness; className?: string }) {
  const f = FRESH[freshness];
  const Icon = freshness === "live" ? Radio : freshness === "closed" ? Clock3 : TriangleAlert;
  return (
    <Tip label={f.tip}>
      <Badge tone={f.tone} className={className} tabIndex={0}>
        <Icon className={cn(freshness === "live" && "live-dot")} aria-hidden />
        {f.label}
      </Badge>
    </Tip>
  );
}

/** Where the numbers come from and when they were fetched. Shown on every block of market data. */
export function SourceLine({ meta, ts, freshness, className }: { meta?: ResponseMeta; ts?: number | null; freshness?: Freshness; className?: string }) {
  if (!meta) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted", className)}>
      {freshness ? <FreshnessBadge freshness={freshness} /> : null}
      <span className="inline-flex items-center gap-1.5">
        {meta.official ? <ShieldCheck className="size-3.5 text-up" aria-hidden /> : <Info className="size-3.5 text-warn" aria-hidden />}
        <span>
          Source: <span className="font-medium text-foreground">{meta.source}</span>
          {meta.official ? " · official broker feed" : " · unofficial, may be delayed"}
        </span>
      </span>
      <span aria-hidden>·</span>
      <span>
        {ts !== undefined ? `Price time ${fmtTime(ts)}` : `Fetched ${fmtTime(meta.fetchedAt)}`}
      </span>
    </div>
  );
}

/** Shown whenever the chosen source failed and Yahoo answered instead — the switch is never silent. */
export function FallbackNotice({ meta, className }: { meta?: ResponseMeta; className?: string }) {
  if (!meta?.fallbackFrom) return null;
  const name = meta.fallbackFrom.provider === "angelone" ? "Angel One" : meta.fallbackFrom.provider === "groww" ? "Groww" : meta.fallbackFrom.provider;
  return (
    <div role="status" className={cn("flex items-start gap-3 rounded-xl border border-warn/35 bg-warn-soft px-4 py-3 text-[13px] leading-5", className)}>
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
      <p>
        <span className="font-medium">{name} could not be used, so these prices come from Yahoo Finance</span> (unofficial, may be delayed). Reason: {meta.fallbackFrom.reason}{" "}
        <Link href="/settings#data" className="font-medium text-foreground underline underline-offset-2">Check data settings</Link>
      </p>
    </div>
  );
}
