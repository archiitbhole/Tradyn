/** Shared market-data types. Everything here describes REAL exchange data from a provider. */

export type Exchange = "NSE" | "BSE";
export type InstrumentKind = "EQ" | "INDEX";
export type ProviderId = "angelone" | "groww" | "yahoo";

export interface Instrument {
  /** Stable id used in URLs and storage: "NSE:RELIANCE", "NSE:NIFTY 50". */
  key: string;
  symbol: string;
  name: string;
  exchange: Exchange;
  kind: InstrumentKind;
  /** Exchange token / scrip code where known (Angel One needs it; BSE code doubles as the Yahoo ticker). */
  token?: string;
  sector?: string;
}

/**
 * How fresh a quote is, decided on the server from the provider and the quote's own timestamp:
 * - live:     official broker feed, traded within the last two minutes while the market is open
 * - delayed:  the source does not promise real time (Yahoo), market open
 * - stale:    market is open but this price is older than two minutes
 * - closed:   market is closed; this is the last traded price of the previous session
 */
export type Freshness = "live" | "delayed" | "stale" | "closed";

export interface Quote {
  key: string;
  symbol: string;
  name: string;
  exchange: Exchange;
  kind: InstrumentKind;
  price: number;
  /** null when the provider did not send a previous close — never estimated. */
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  /** Exchange / feed time of the price in ms since epoch; null if the provider gave none. */
  ts: number | null;
  provider: ProviderId;
  source: string;
  freshness: Freshness;
  sector?: string;
}

export interface Candle {
  /** Start of the candle, seconds since epoch (UTC). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export const RANGES = ["1D", "1W", "1M", "3M", "6M", "1Y", "5Y"] as const;
export type HistoryRange = (typeof RANGES)[number];

export interface History {
  key: string;
  range: HistoryRange;
  /** Human label of the candle size, e.g. "5 min", "1 day". */
  interval: string;
  intraday: boolean;
  candles: Candle[];
}

export interface MarketStatus {
  open: boolean;
  /** "open" | "pre-open" | "closed" | "weekend" */
  phase: "open" | "pre" | "closed" | "weekend";
  label: string;
  /** Current time in India, ISO string. */
  istTime: string;
  nextChange: string;
  /** Exchange holidays are not in the timetable; this is set when prices stop arriving on a weekday. */
  note: string | null;
}

export interface Breadth {
  advances: number;
  declines: number;
  unchanged: number;
  /** Shares the provider returned a usable quote for. */
  priced: number;
  /** Shares asked for. */
  universe: number;
}

export interface SectorPerformance {
  sector: string;
  /** Equal-weighted average day change of the tracked shares in the sector. */
  changePct: number;
  advances: number;
  declines: number;
  count: number;
}

export interface Movers {
  gainers: Quote[];
  losers: Quote[];
  /** Highest number of shares traded today. */
  mostActive: Quote[];
  /** Highest value traded today, estimated as last price × volume (the sources do not publish turnover). */
  mostValue: Quote[];
  breadth: Breadth;
  sectors: SectorPerformance[];
  universeLabel: string;
}

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  official: boolean;
  /** True when the source itself may lag the exchange. */
  delayed: boolean;
  configured: boolean;
  missing: string[];
  note: string;
}

export interface ResponseMeta {
  provider: ProviderId;
  source: string;
  official: boolean;
  fetchedAt: number;
  /** Set when the configured provider failed and the optional fallback answered instead. */
  fallbackFrom?: { provider: ProviderId; reason: string };
  notice?: string;
}

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "NOT_CONFIGURED"
  | "AUTH_FAILED"
  | "PROVIDER_ERROR"
  | "PROVIDER_UNREACHABLE"
  | "INTERNAL";

export interface ApiError {
  code: ErrorCode;
  message: string;
  /** Environment variable names (never values) the deployment still needs. */
  missing?: string[];
  provider?: ProviderId;
}

export type ApiResponse<T> = { ok: true; data: T; meta?: ResponseMeta } | { ok: false; error: ApiError };

/** One row of the Markets table: the instrument, and its quote when the provider returned one. */
export interface MarketRow {
  instrument: Instrument;
  quote: Quote | null;
}

export const SORT_KEYS = ["symbol", "name", "price", "change", "changePct", "volume", "high", "low", "prevClose"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface MarketList {
  rows: MarketRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  /** Columns the list can be ordered by in this view (price columns need every row priced). */
  sortable: SortKey[];
  scope: "tracked" | "all";
  exchange: Exchange;
  /** How many of the rows on this page have a price. */
  priced: number;
  note: string | null;
}

export interface IndicesPayload {
  indices: Quote[];
  /** Indices the current source cannot provide, by name. */
  unavailable: string[];
  status: MarketStatus;
}

export interface WatchlistItem {
  key: string;
  symbol: string;
  name: string;
  exchange: Exchange;
  kind: InstrumentKind;
}

export interface Watchlist {
  id: string;
  name: string;
  items: WatchlistItem[];
}

export interface SessionInfo {
  /** False when SUPABASE_URL / SUPABASE_ANON_KEY are not set: watchlists then stay on this device. */
  accountsEnabled: boolean;
  missing: string[];
  user: { id: string; email: string } | null;
}

export interface SettingsPayload {
  providers: ProviderInfo[];
  selected: ProviderId | null;
  selectionMode: "explicit" | "auto";
  problem: string | null;
  yahooFallback: boolean;
  universe: { full: boolean; generatedAt: string | null; source: string; nse: number; bse: number; trackedLabel: string; trackedCount: number };
  accounts: { enabled: boolean; missing: string[]; tokenSharing: boolean };
  version: string;
}
