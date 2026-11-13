const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export const DASH = "—";

export function fmtPrice(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? DASH : inr.format(v);
}

export function fmtChange(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return (v > 0 ? "+" : v < 0 ? "−" : "") + inr.format(Math.abs(v));
}

export function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(digits) + "%";
}

export function fmtVolume(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? DASH : compact.format(v);
}

export function fmtInt(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? DASH : whole.format(v);
}

/** "15:29:58" in India time, or a date when the price is from an earlier day. */
export function fmtTime(ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return "time not provided";
  const d = new Date(ts);
  const sameDay =
    d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) === new Date(now).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
  return sameDay
    ? d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) + " IST"
    : d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) + " IST";
}

export function fmtAgo(ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return "";
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function trend(v: number | null | undefined): "up" | "down" | "flat" {
  if (v == null || !Number.isFinite(v) || v === 0) return "flat";
  return v > 0 ? "up" : "down";
}

export function keyToPath(key: string): string {
  return "/stocks/" + encodeURIComponent(key);
}
