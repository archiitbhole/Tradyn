import type { Exchange, History, HistoryRange, Instrument, MarketStatus, Movers, ProviderId, Quote } from "@/types/market";

export interface QuoteBatch {
  quotes: Quote[];
  /** Short, user-safe reasons for instruments that could not be priced. */
  errors: string[];
}

/** The one interface every market-data source implements. */
export interface MarketDataProvider {
  readonly id: ProviderId;
  readonly name: string;
  /** Official exchange/broker feed (true) or an unofficial public source (false). */
  readonly official: boolean;
  /** The source itself may lag the exchange. */
  readonly delayed: boolean;
  readonly note: string;
  /** How many shares this source can price for market-wide rankings within one request. */
  readonly moversLimit: number;
  /** Names of environment variables that are still missing (never their values). */
  missingEnv(): string[];
  getQuote(instrument: Instrument): Promise<Quote>;
  getQuotes(instruments: Instrument[]): Promise<QuoteBatch>;
  getHistoricalCandles(instrument: Instrument, range: HistoryRange): Promise<History>;
  searchStocks(text: string, exchange: Exchange | "ALL", limit: number): Promise<Instrument[]>;
  getMarketStatus(): Promise<MarketStatus>;
  getMarketMovers(exchange: Exchange): Promise<Movers>;
}
