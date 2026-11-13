"use client";
import { Tip } from "@/components/ui/tooltip";
import { useMarketStatus } from "@/hooks/use-market";
import { cn } from "@/lib/utils/cn";

/** NSE/BSE session from the exchange timetable. */
export function StatusPill({ className }: { className?: string }) {
  const { data } = useMarketStatus();
  if (!data) return <span className={cn("h-7 w-28 animate-pulse rounded-full bg-surface-2", className)} aria-hidden />;
  const dot = data.phase === "open" ? "bg-up live-dot" : data.phase === "pre" ? "bg-warn" : "bg-faint";
  return (
    <Tip label={<>{data.nextChange}. Based on the NSE/BSE timetable (09:15–15:30 IST, Mon–Fri); exchange holidays are not included.</>} side="bottom">
      <span tabIndex={0} className={cn("inline-flex h-7 items-center gap-2 whitespace-nowrap rounded-full border bg-surface px-3 text-xs font-medium", className)}>
        <span className={cn("size-2 rounded-full", dot)} aria-hidden />
        {data.label}
      </span>
    </Tip>
  );
}
