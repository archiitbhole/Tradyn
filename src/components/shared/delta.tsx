import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { fmtChange, fmtPct, trend } from "@/lib/utils/format";

const COLOR = { up: "text-up", down: "text-down", flat: "text-muted" } as const;

/** Day change as a coloured number with a direction arrow (never colour alone). */
export function Delta({ change, pct, className, showChange = true, pill = false }: { change?: number | null; pct: number | null; className?: string; showChange?: boolean; pill?: boolean }) {
  const t = trend(pct);
  const Icon = t === "up" ? ArrowUpRight : t === "down" ? ArrowDownRight : Minus;
  if (pct == null) return <span className={cn("num text-faint", className)} title="The source did not send a previous close">—</span>;
  return (
    <span className={cn("num inline-flex items-center gap-1 whitespace-nowrap font-medium", COLOR[t], pill && (t === "up" ? "rounded-md bg-up-soft px-1.5 py-0.5" : t === "down" ? "rounded-md bg-down-soft px-1.5 py-0.5" : "rounded-md bg-surface-2 px-1.5 py-0.5"), className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {showChange && change != null ? <span>{fmtChange(change)}</span> : null}
      <span>{showChange && change != null ? `(${fmtPct(pct)})` : fmtPct(pct)}</span>
    </span>
  );
}
