"use client";
import Link from "next/link";
import { fmtPct } from "@/lib/utils/format";
import type { SectorPerformance } from "@/types/market";

/** Diverging bars: each sector's average day change, scaled to the largest move shown. */
export function SectorBars({ sectors, linkBase = "/markets" }: { sectors: SectorPerformance[]; linkBase?: string }) {
  const max = Math.max(0.25, ...sectors.map((s) => Math.abs(s.changePct)));
  return (
    <ul className="space-y-1">
      {sectors.map((s) => {
        const w = (Math.abs(s.changePct) / max) * 50;
        const up = s.changePct >= 0;
        return (
          <li key={s.sector}>
            <Link href={`${linkBase}?sector=${encodeURIComponent(s.sector)}`} className="group grid grid-cols-[104px_1fr_64px] items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2 sm:grid-cols-[128px_1fr_70px]" title={`${s.advances} up, ${s.declines} down of ${s.count} shares`}>
              <span className="truncate text-[13px] font-medium group-hover:text-brand">{s.sector}</span>
              <span className="relative h-2.5 rounded-full bg-surface-2" aria-hidden>
                <span className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
                <span className={`absolute inset-y-0 rounded-full ${up ? "bg-up" : "bg-down"}`} style={up ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />
              </span>
              <span className={`num text-right text-[13px] font-medium ${up ? "text-up" : "text-down"}`}>{fmtPct(s.changePct)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
