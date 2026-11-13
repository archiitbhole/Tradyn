/**
 * "Tradyn 100": about a hundred large, widely traded NSE companies with a sector label.
 * This is Tradyn's own tracking list (NOT an official NSE/BSE index). Rankings such as
 * gainers, losers, breadth and sector averages are computed over this list, because no
 * provider used here offers a whole-market ranking for the cash segment.
 * It holds names and sectors only — never prices.
 */
export const TRACKED_LABEL = "Tradyn 100";

export const SECTORS = [
  "Financials", "IT", "Energy", "Automobile", "FMCG", "Healthcare", "Metals", "Infrastructure", "Consumer", "Industrials", "Services",
] as const;
export type Sector = (typeof SECTORS)[number];

export const TRACKED: ReadonlyArray<readonly [symbol: string, name: string, sector: Sector]> = [
  ["HDFCBANK", "HDFC Bank", "Financials"], ["ICICIBANK", "ICICI Bank", "Financials"], ["SBIN", "State Bank of India", "Financials"],
  ["KOTAKBANK", "Kotak Mahindra Bank", "Financials"], ["AXISBANK", "Axis Bank", "Financials"], ["INDUSINDBK", "IndusInd Bank", "Financials"],
  ["BAJFINANCE", "Bajaj Finance", "Financials"], ["BAJAJFINSV", "Bajaj Finserv", "Financials"], ["HDFCLIFE", "HDFC Life Insurance", "Financials"],
  ["SBILIFE", "SBI Life Insurance", "Financials"], ["ICICIGI", "ICICI Lombard General Insurance", "Financials"], ["PNB", "Punjab National Bank", "Financials"],
  ["BANKBARODA", "Bank of Baroda", "Financials"], ["CANBK", "Canara Bank", "Financials"], ["FEDERALBNK", "Federal Bank", "Financials"],
  ["IDFCFIRSTB", "IDFC First Bank", "Financials"], ["CHOLAFIN", "Cholamandalam Investment & Finance", "Financials"], ["SHRIRAMFIN", "Shriram Finance", "Financials"],
  ["MUTHOOTFIN", "Muthoot Finance", "Financials"], ["PFC", "Power Finance Corporation", "Financials"], ["RECLTD", "REC", "Financials"],
  ["LICI", "Life Insurance Corporation of India", "Financials"], ["JIOFIN", "Jio Financial Services", "Financials"],

  ["TCS", "Tata Consultancy Services", "IT"], ["INFY", "Infosys", "IT"], ["HCLTECH", "HCL Technologies", "IT"], ["WIPRO", "Wipro", "IT"],
  ["TECHM", "Tech Mahindra", "IT"], ["PERSISTENT", "Persistent Systems", "IT"], ["COFORGE", "Coforge", "IT"], ["MPHASIS", "Mphasis", "IT"],
  ["OFSS", "Oracle Financial Services Software", "IT"],

  ["RELIANCE", "Reliance Industries", "Energy"], ["ONGC", "Oil & Natural Gas Corporation", "Energy"], ["NTPC", "NTPC", "Energy"],
  ["POWERGRID", "Power Grid Corporation of India", "Energy"], ["COALINDIA", "Coal India", "Energy"], ["BPCL", "Bharat Petroleum Corporation", "Energy"],
  ["IOC", "Indian Oil Corporation", "Energy"], ["GAIL", "GAIL (India)", "Energy"], ["TATAPOWER", "Tata Power", "Energy"],
  ["ADANIGREEN", "Adani Green Energy", "Energy"], ["ADANIPOWER", "Adani Power", "Energy"], ["HINDPETRO", "Hindustan Petroleum Corporation", "Energy"],

  ["MARUTI", "Maruti Suzuki India", "Automobile"], ["M&M", "Mahindra & Mahindra", "Automobile"], ["BAJAJ-AUTO", "Bajaj Auto", "Automobile"],
  ["EICHERMOT", "Eicher Motors", "Automobile"], ["HEROMOTOCO", "Hero MotoCorp", "Automobile"], ["TVSMOTOR", "TVS Motor Company", "Automobile"],
  ["ASHOKLEY", "Ashok Leyland", "Automobile"], ["BOSCHLTD", "Bosch", "Automobile"], ["MOTHERSON", "Samvardhana Motherson International", "Automobile"],

  ["HINDUNILVR", "Hindustan Unilever", "FMCG"], ["ITC", "ITC", "FMCG"], ["NESTLEIND", "Nestle India", "FMCG"], ["BRITANNIA", "Britannia Industries", "FMCG"],
  ["TATACONSUM", "Tata Consumer Products", "FMCG"], ["DABUR", "Dabur India", "FMCG"], ["GODREJCP", "Godrej Consumer Products", "FMCG"],
  ["MARICO", "Marico", "FMCG"], ["COLPAL", "Colgate-Palmolive (India)", "FMCG"], ["VBL", "Varun Beverages", "FMCG"],

  ["SUNPHARMA", "Sun Pharmaceutical Industries", "Healthcare"], ["DRREDDY", "Dr. Reddy's Laboratories", "Healthcare"], ["CIPLA", "Cipla", "Healthcare"],
  ["DIVISLAB", "Divi's Laboratories", "Healthcare"], ["APOLLOHOSP", "Apollo Hospitals Enterprise", "Healthcare"], ["LUPIN", "Lupin", "Healthcare"],
  ["AUROPHARMA", "Aurobindo Pharma", "Healthcare"], ["TORNTPHARM", "Torrent Pharmaceuticals", "Healthcare"], ["ZYDUSLIFE", "Zydus Lifesciences", "Healthcare"],
  ["MAXHEALTH", "Max Healthcare Institute", "Healthcare"],

  ["TATASTEEL", "Tata Steel", "Metals"], ["JSWSTEEL", "JSW Steel", "Metals"], ["HINDALCO", "Hindalco Industries", "Metals"], ["VEDL", "Vedanta", "Metals"],
  ["JINDALSTEL", "Jindal Steel & Power", "Metals"], ["NMDC", "NMDC", "Metals"], ["SAIL", "Steel Authority of India", "Metals"],

  ["LT", "Larsen & Toubro", "Infrastructure"], ["ULTRACEMCO", "UltraTech Cement", "Infrastructure"], ["GRASIM", "Grasim Industries", "Infrastructure"],
  ["SHREECEM", "Shree Cement", "Infrastructure"], ["AMBUJACEM", "Ambuja Cements", "Infrastructure"], ["ADANIPORTS", "Adani Ports & SEZ", "Infrastructure"],
  ["ADANIENT", "Adani Enterprises", "Infrastructure"], ["DLF", "DLF", "Infrastructure"], ["GODREJPROP", "Godrej Properties", "Infrastructure"],

  ["TITAN", "Titan Company", "Consumer"], ["ASIANPAINT", "Asian Paints", "Consumer"], ["TRENT", "Trent", "Consumer"], ["DMART", "Avenue Supermarts", "Consumer"],
  ["PIDILITIND", "Pidilite Industries", "Consumer"], ["HAVELLS", "Havells India", "Consumer"], ["BERGEPAINT", "Berger Paints India", "Consumer"],
  ["PAGEIND", "Page Industries", "Consumer"],

  ["SIEMENS", "Siemens", "Industrials"], ["ABB", "ABB India", "Industrials"], ["BEL", "Bharat Electronics", "Industrials"],
  ["HAL", "Hindustan Aeronautics", "Industrials"], ["BHEL", "Bharat Heavy Electricals", "Industrials"], ["CUMMINSIND", "Cummins India", "Industrials"],
  ["POLYCAB", "Polycab India", "Industrials"],

  ["BHARTIARTL", "Bharti Airtel", "Services"], ["INDIGO", "InterGlobe Aviation", "Services"], ["IRCTC", "Indian Railway Catering & Tourism Corporation", "Services"],
  ["NAUKRI", "Info Edge (India)", "Services"],
];

/** Market indices. Each provider names an index differently; a missing entry means that provider cannot serve it. */
export interface IndexDef {
  symbol: string;
  name: string;
  exchange: "NSE" | "BSE";
  headline: boolean;
  yahoo?: string;
  /** Angel One token; others are looked up in the instrument master by name. */
  angelToken?: string;
  groww?: string;
}

export const INDICES: IndexDef[] = [
  { symbol: "NIFTY 50", name: "Nifty 50", exchange: "NSE", headline: true, yahoo: "^NSEI", angelToken: "99926000", groww: "NIFTY" },
  { symbol: "SENSEX", name: "BSE Sensex", exchange: "BSE", headline: true, yahoo: "^BSESN", angelToken: "99919000", groww: "SENSEX" },
  { symbol: "NIFTY BANK", name: "Nifty Bank", exchange: "NSE", headline: true, yahoo: "^NSEBANK", angelToken: "99926009", groww: "BANKNIFTY" },
  { symbol: "NIFTY IT", name: "Nifty IT", exchange: "NSE", headline: false, yahoo: "^CNXIT" },
  { symbol: "INDIA VIX", name: "India VIX (volatility index)", exchange: "NSE", headline: false, yahoo: "^INDIAVIX" },
];
