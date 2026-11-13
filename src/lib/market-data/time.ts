const IST_MS = 330 * 60_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" of an instant, in India time. */
export function istDate(ms: number): string {
  const d = new Date(ms + IST_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** "YYYY-MM-DD HH:mm" (or with seconds) in India time — the format the broker APIs expect. */
export function istStamp(ms: number, seconds = false): string {
  const d = new Date(ms + IST_MS);
  return `${istDate(ms)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${seconds ? ":" + pad(d.getUTCSeconds()) : ""}`;
}

/** Midnight UTC (in seconds) of the India calendar day that contains `ms`: the chart time of a daily candle. */
export function istDayStartSec(ms: number): number {
  return Date.parse(istDate(ms) + "T00:00:00Z") / 1000;
}

const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

/** Angel One feed time, e.g. "13-Nov-2026 15:29:58" (India time) -> ms since epoch, or null. */
export function parseAngelFeedTime(s: string): number | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const mon = MONTHS[m[2][0].toUpperCase() + m[2].slice(1).toLowerCase()];
  if (mon === undefined) return null;
  return Date.UTC(+m[3], mon, +m[1], +m[4], +m[5], +m[6]) - IST_MS;
}

/** A date-time with no zone is read as India time (broker APIs answer in IST). */
export function parseIstLoose(s: string): number | null {
  const t = s.trim();
  const ms = /[zZ]|[+-]\d{2}:?\d{2}$/.test(t) ? Date.parse(t) : Date.parse(t.replace(" ", "T") + "+05:30");
  return Number.isFinite(ms) ? ms : null;
}
