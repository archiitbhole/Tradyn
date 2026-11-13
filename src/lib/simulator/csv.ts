import { STRATEGY_NAMES } from "./config";
import { marketSummary, strategySummary } from "./analysis";
import type { MarketEngine } from "./engine";

type Cell = string | number | boolean | null;

/** RFC 4180 CSV. Text starting with = + - @ is prefixed so a spreadsheet never runs it as a formula. */
export function toCsv(header: string[], rows: Cell[][]): string {
  const cell = (v: Cell) => {
    if (v == null) return "";
    if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : "";
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export interface CsvFile {
  name: string;
  label: string;
  content: string;
}

const NOTE = "SIMULATED DATA - Tradyn Simulator - artificial market, not real stock prices";

/** The five simulator tables. Every file says in its first column header that the data is simulated. */
export function exportFiles(e: MarketEngine): CsvFile[] {
  const ms = marketSummary(e);
  return [
    {
      name: "tradyn-sim-market.csv", label: "Market, step by step",
      content: toCsv(["step", "sim_price", "buy_pressure", "sell_pressure", "net_demand", "demand_ratio", "volume", "buyers", "sellers", "holders", "rejected", "capped", "sentiment", "events", NOTE],
        e.history.map((r) => [r.step, r.price, r.buyPressure, r.sellPressure, r.netDemand, r.demandRatio, r.volume, r.buyers, r.sellers, r.holders, r.rejected, r.capped, r.sentiment, r.events, ""])),
    },
    {
      name: "tradyn-sim-trades.csv", label: "Every order",
      content: toCsv(["step", "trader", "strategy", "action", "quantity", "sim_price", "status", NOTE], e.trades.map((t) => [t.step, t.trader, t.strategy, t.action, t.quantity, t.price, t.status, ""])),
    },
    {
      name: "tradyn-sim-traders.csv", label: "Trader portfolios",
      content: toCsv(["trader", "strategy", "cash", "shares", "portfolio_value", "profit_loss", "return_pct", "trades", "rejected", "last_action", NOTE],
        e.traderRows().map((t) => [t.trader, t.strategy, t.cash, t.shares, t.portfolioValue, t.profitLoss, t.returnPct, t.trades, t.rejected, t.lastAction, ""])),
    },
    {
      name: "tradyn-sim-strategy-summary.csv", label: "Strategy performance",
      content: toCsv(["strategy", "traders", "mean_return_pct", "std_return_pct", "best_pct", "worst_pct", "avg_trades", "rejected", NOTE],
        strategySummary(e).map((s) => [s.strategy, s.traders, s.meanReturnPct, s.stdReturnPct, s.bestPct, s.worstPct, s.avgTrades, s.rejected, ""])),
    },
    {
      name: "tradyn-sim-portfolio-growth.csv", label: "Average portfolio value per strategy",
      content: toCsv(["step", ...STRATEGY_NAMES, NOTE], e.history.map((r, i) => [r.step, ...STRATEGY_NAMES.map((n) => e.growth[n][i]), ""])),
    },
    {
      name: "tradyn-sim-summary.csv", label: "Run summary",
      content: toCsv(["metric", "value", NOTE], Object.entries(ms).map(([k, v]) => [k, v, ""])),
    },
  ];
}
