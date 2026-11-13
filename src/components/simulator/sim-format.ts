import type { StrategyName } from "@/lib/simulator/config";

export const STRATEGY_COLOR: Record<StrategyName, string> = { Random: "var(--faint)", Momentum: "var(--warn)", "Mean Reversion": "var(--info)", "Risk-Averse": "var(--sim)" };

const two = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const zero = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export const simNum = (v: number) => two.format(v);
export const simInt = (v: number) => zero.format(v);
export const simPct = (v: number, d = 2) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d) + "%";

export const TOOLTIP_STYLE = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--foreground)" } as const;
export const AXIS_TICK = { fontSize: 11, fill: "var(--muted)" } as const;
