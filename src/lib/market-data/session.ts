import type { Freshness, MarketStatus, ProviderId } from "@/types/market";

const IST_OFFSET_MIN = 330;
const OPEN_MIN = 9 * 60 + 15;
const CLOSE_MIN = 15 * 60 + 30;
const PRE_MIN = 9 * 60;

/** Wall-clock fields in India time for a UTC instant. */
export function istParts(now = Date.now()) {
  const d = new Date(now + IST_OFFSET_MIN * 60_000);
  return { day: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), iso: d.toISOString().replace("Z", "+05:30") };
}

/**
 * NSE/BSE cash-market timetable: pre-open 09:00, regular session 09:15–15:30 IST, Monday–Friday.
 * Exchange holidays are not known to this function; `lastTickTs` (the newest index tick) is used
 * to say so when a weekday session has no prices arriving.
 */
export function marketStatus(now = Date.now(), lastTickTs?: number | null): MarketStatus {
  const { day, minutes, iso } = istParts(now);
  const weekday = day >= 1 && day <= 5;
  let phase: MarketStatus["phase"];
  let label: string;
  let nextChange: string;
  if (!weekday) {
    phase = "weekend";
    label = "Market closed";
    nextChange = "Opens Monday 09:15 IST";
  } else if (minutes >= OPEN_MIN && minutes <= CLOSE_MIN) {
    phase = "open";
    label = "Market open";
    nextChange = "Closes 15:30 IST";
  } else if (minutes >= PRE_MIN && minutes < OPEN_MIN) {
    phase = "pre";
    label = "Pre-open session";
    nextChange = "Opens 09:15 IST";
  } else {
    phase = "closed";
    label = "Market closed";
    nextChange = minutes < PRE_MIN ? "Opens 09:15 IST" : day === 5 ? "Opens Monday 09:15 IST" : "Opens tomorrow 09:15 IST";
  }
  let note: string | null = null;
  if (phase === "open" && lastTickTs && now - lastTickTs > 20 * 60_000 && minutes > OPEN_MIN + 20) {
    note = "No new index prices for over 20 minutes during trading hours — today may be an exchange holiday, or the data source is lagging.";
  }
  return { open: phase === "open", phase, label, istTime: iso, nextChange, note };
}

const STALE_MS = 2 * 60_000;

export function freshnessOf(provider: ProviderId, ts: number | null, now = Date.now()): Freshness {
  const st = marketStatus(now);
  if (!st.open) return "closed";
  if (ts != null && now - ts > (provider === "yahoo" ? 20 * 60_000 : STALE_MS)) return "stale";
  return provider === "yahoo" ? "delayed" : ts == null ? "stale" : "live";
}
