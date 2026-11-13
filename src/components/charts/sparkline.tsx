import { cn } from "@/lib/utils/cn";

/** A tiny line of real closing prices. Draws nothing when there are fewer than two points. */
export function Sparkline({ values, baseline, className, tone }: { values: number[]; baseline?: number | null; className?: string; tone?: "up" | "down" | "flat" }) {
  if (values.length < 2) return <div className={cn("h-10", className)} aria-hidden />;
  const W = 120;
  const H = 40;
  const all = baseline != null ? [...values, baseline] : values;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - 3 - ((v - lo) / span) * (H - 6);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const t = tone ?? (values[values.length - 1] >= (baseline ?? values[0]) ? "up" : "down");
  const color = t === "up" ? "var(--up)" : t === "down" ? "var(--down)" : "var(--muted)";
  const id = `sp-${t}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn("h-10 w-full", className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${id})`} />
      {baseline != null ? <line x1="0" x2={W} y1={y(baseline)} y2={y(baseline)} stroke="var(--faint)" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" /> : null}
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
