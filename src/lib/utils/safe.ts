/** Small helpers for reading untyped JSON from providers without `any`. */
export type Rec = Record<string, unknown>;

export function rec(v: unknown): Rec {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {};
}

export function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** A finite number, or null. Never guesses: "", null, NaN and non-numeric text all give null. */
export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function str(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}
