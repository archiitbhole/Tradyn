import { STRATEGY_NAMES, defaultConfig, maxQty, validateConfig, type SimConfig, type StrategyName } from "./config";
import { createRng, type Rng } from "./rng";

export const BUY = 1;
export const HOLD = 0;
export const SELL = -1;
export type Action = typeof BUY | typeof HOLD | typeof SELL;
export const ACTION_LABEL: Record<Action, "BUY" | "HOLD" | "SELL"> = { [BUY]: "BUY", [HOLD]: "HOLD", [SELL]: "SELL" };

// ---------------------------------------------------------------- price model
/** Always between −1 and +1. */
export const demandRatio = (buy: number, sell: number) => (buy - sell) / (buy + sell + 1);

/** New Price = Old Price × (1 + Sensitivity × Demand Ratio), with a per-step cap and a floor. */
export function nextPrice(price: number, ratio: number, sensitivity: number, maxMove: number, minPrice: number): { price: number; capped: boolean } {
  let change = sensitivity * ratio;
  let capped = false;
  if (Math.abs(change) > maxMove) {
    change = change > 0 ? maxMove : -maxMove;
    capped = true;
  }
  return { price: Math.max(minPrice, price * (1 + change)), capped };
}

// ---------------------------------------------------------------- strategies
const recentReturn = (p: number[], k: number) => (p.length <= k ? 0 : p[p.length - 1] / p[p.length - 1 - k] - 1);
function movingAvg(p: number[], w: number) {
  const n = Math.min(w, p.length);
  let s = 0;
  for (let i = p.length - n; i < p.length; i++) s += p[i];
  return s / n;
}

interface Strategy {
  rule: string;
  behaviour: string;
  decide(prices: number[], rng: Rng): Action;
  qty(rng: Rng, max: number): number;
}

export const STRATEGIES: Record<StrategyName, Strategy> = {
  Random: { rule: "Picks BUY, SELL or HOLD with equal odds.", behaviour: "Unpredictable", decide: (_p, rng) => rng.pick([BUY, SELL, HOLD] as const), qty: (rng, m) => rng.int(1, m + 1) },
  Momentum: {
    rule: "Follows the trend: 5-step return above +0.2% → BUY, below −0.2% → SELL.", behaviour: "More active",
    decide(p) {
      const r = recentReturn(p, 5);
      return r > 0.002 ? BUY : r < -0.002 ? SELL : HOLD;
    },
    qty: (rng, m) => rng.int(1, m + 1),
  },
  "Mean Reversion": {
    rule: "Price 1% above its 10-step average → SELL; 1% below → BUY.", behaviour: "Counter-trend",
    decide(p) {
      if (p.length < 10) return HOLD;
      const d = p[p.length - 1] / movingAvg(p, 10) - 1;
      return d > 0.01 ? SELL : d < -0.01 ? BUY : HOLD;
    },
    qty: (rng, m) => rng.int(1, m + 1),
  },
  "Risk-Averse": {
    rule: "Acts only on 5-step moves above 1.5%, half the time, with smaller orders.", behaviour: "Conservative",
    decide(p, rng) {
      const r = recentReturn(p, 5);
      if (Math.abs(r) <= 0.015 || rng.random() > 0.5) return HOLD;
      return r > 0 ? BUY : SELL;
    },
    qty: (rng, m) => rng.int(1, Math.max(1, Math.floor(m / 2)) + 1),
  },
};

// ---------------------------------------------------------------- events
export interface MarketEvent {
  key: EventKey;
  name: string;
  description: string;
  /** Chance that a trader who was not going to buy / sell is pushed into it. */
  buy: number;
  sell: number;
  /** Order-size multiplier. */
  boost: number;
  duration: number;
}
export type EventKey = "positive" | "negative" | "shock" | "bull";

export const EVENTS: Record<EventKey, MarketEvent> = {
  positive: { key: "positive", name: "Positive news", description: "Raises buying confidence for 10 steps", buy: 0.3, sell: 0, boost: 1.0, duration: 10 },
  negative: { key: "negative", name: "Negative news", description: "Raises selling pressure for 10 steps", buy: 0, sell: 0.3, boost: 1.0, duration: 10 },
  shock: { key: "shock", name: "Market shock", description: "Sudden heavy selling and bigger orders for 6 steps", buy: 0, sell: 0.6, boost: 1.8, duration: 6 },
  bull: { key: "bull", name: "Bull run", description: "Sustained extra buying for 40 steps", buy: 0.25, sell: 0, boost: 1.0, duration: 40 },
};

// ---------------------------------------------------------------- engine
export interface Trader {
  id: number;
  code: string;
  strategy: StrategyName;
  cash: number;
  shares: number;
  initial: number;
  trades: number;
  rejected: number;
  last: Action;
}

export interface StepRecord {
  step: number;
  price: number;
  buyPressure: number;
  sellPressure: number;
  netDemand: number;
  demandRatio: number;
  volume: number;
  buyers: number;
  sellers: number;
  holders: number;
  rejected: number;
  capped: boolean;
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  events: string;
}

export interface TradeRecord {
  step: number;
  trader: string;
  strategy: StrategyName;
  action: "BUY" | "SELL";
  quantity: number;
  price: number;
  status: "FILLED" | "REJECTED";
}

export interface TraderRow {
  trader: string;
  strategy: StrategyName;
  cash: number;
  shares: number;
  portfolioValue: number;
  profitLoss: number;
  returnPct: number;
  trades: number;
  rejected: number;
  lastAction: "BUY" | "HOLD" | "SELL";
}

const TRADE_LOG_LIMIT = 200_000;

/**
 * One artificial market. Each step runs the same ten stages: read state → every trader decides →
 * order size → check cash/shares (unaffordable orders are REJECTED) → buy & sell pressure →
 * net demand → new price → update portfolios → record → next step.
 */
export class MarketEngine {
  readonly cfg: SimConfig;
  readonly traders: Trader[];
  readonly history: StepRecord[] = [];
  readonly prices: number[] = [];
  readonly trades: TradeRecord[] = [];
  readonly eventLog: { step: number; key: EventKey; name: string; duration: number }[] = [];
  /** Average portfolio value per strategy at every step. */
  readonly growth: Record<StrategyName, (number | null)[]> = { Random: [], Momentum: [], "Mean Reversion": [], "Risk-Averse": [] };
  price: number;
  stepNo = 0;
  sentiment: StepRecord["sentiment"] = "NEUTRAL";
  private readonly rng: Rng;
  private active: { e: MarketEvent; remaining: number }[] = [];
  private ema = 0;

  constructor(cfg: Partial<SimConfig> = {}, private readonly recordTrades = true) {
    this.cfg = { ...defaultConfig(), ...structuredClone(cfg) };
    const problem = validateConfig(this.cfg);
    if (problem) throw new Error(problem);
    this.rng = createRng(this.cfg.seed);
    this.traders = this.createTraders();
    this.price = this.cfg.initialPrice;
    this.record({ step: 0, price: this.price, buyPressure: 0, sellPressure: 0, netDemand: 0, demandRatio: 0, volume: 0, buyers: 0, sellers: 0, holders: this.traders.length, rejected: 0, capped: false, sentiment: "NEUTRAL", events: "" });
  }

  private createTraders(): Trader[] {
    const c = this.cfg;
    const w = STRATEGY_NAMES.map((n) => Math.max(0, c.mix[n] || 0));
    const total = w.reduce((a, b) => a + b, 0);
    const exact = w.map((x) => (x / total) * c.traders);
    const counts = exact.map(Math.floor);
    const left = c.traders - counts.reduce((a, b) => a + b, 0);
    exact.map((x, i) => [x - counts[i], i] as const).sort((a, b) => b[0] - a[0]).slice(0, left).forEach(([, i]) => counts[i]++);
    const names: StrategyName[] = [];
    STRATEGY_NAMES.forEach((n, i) => {
      for (let k = 0; k < counts[i]; k++) names.push(n);
    });
    this.rng.shuffle(names);
    const start = c.initialCash + c.initialShares * c.initialPrice;
    return names.map((strategy, i) => ({ id: i + 1, code: "T" + String(i + 1).padStart(2, "0"), strategy, cash: c.initialCash, shares: c.initialShares, initial: start, trades: 0, rejected: 0, last: HOLD }));
  }

  get finished(): boolean {
    return this.stepNo >= this.cfg.steps;
  }

  get activeEvents(): { key: EventKey; name: string; remaining: number }[] {
    return this.active.map((a) => ({ key: a.e.key, name: a.e.name, remaining: a.remaining }));
  }

  trigger(key: EventKey): void {
    const e = EVENTS[key];
    this.active.push({ e, remaining: e.duration });
    this.eventLog.push({ step: this.stepNo + 1, key, name: e.name, duration: e.duration });
  }

  step(): StepRecord {
    const c = this.cfg;
    const rng = this.rng;
    const old = this.price;
    const stepIdx = this.stepNo + 1;
    const buyPush = Math.min(0.9, this.active.reduce((s, a) => s + a.e.buy, 0));
    const sellPush = Math.min(0.9, this.active.reduce((s, a) => s + a.e.sell, 0));
    const boost = this.active.reduce((m, a) => Math.max(m, a.e.boost), 1.0);
    const mq = maxQty(c);
    let bp = 0, sp = 0, rej = 0, nb = 0, ns = 0, nh = 0;
    for (const t of this.traders) {
      const st = STRATEGIES[t.strategy];
      let a = st.decide(this.prices, rng);
      if (buyPush && a !== BUY && rng.random() < buyPush) a = BUY;
      else if (sellPush && a !== SELL && rng.random() < sellPush) a = SELL;
      if (a === HOLD) {
        nh++;
        t.last = HOLD;
        continue;
      }
      const q = Math.max(1, Math.round(st.qty(rng, mq) * boost));
      const affordable = a === BUY ? t.cash >= q * old : t.shares >= q;
      const log = this.recordTrades && this.trades.length < TRADE_LOG_LIMIT;
      if (!affordable) {
        rej++;
        t.rejected++;
        t.last = HOLD;
        nh++;
        if (log) this.trades.push({ step: stepIdx, trader: t.code, strategy: t.strategy, action: ACTION_LABEL[a] as "BUY" | "SELL", quantity: q, price: old, status: "REJECTED" });
        continue;
      }
      if (a === BUY) {
        t.cash -= q * old;
        t.shares += q;
        bp += q;
        nb++;
      } else {
        t.cash += q * old;
        t.shares -= q;
        sp += q;
        ns++;
      }
      t.trades++;
      t.last = a;
      if (log) this.trades.push({ step: stepIdx, trader: t.code, strategy: t.strategy, action: ACTION_LABEL[a] as "BUY" | "SELL", quantity: q, price: old, status: "FILLED" });
    }
    const ratio = demandRatio(bp, sp);
    const next = nextPrice(old, ratio, c.sensitivity, c.maxMove, c.minPrice);
    this.price = next.price;
    this.ema = 0.8 * this.ema + 0.2 * ratio;
    this.sentiment = this.ema > 0.08 ? "BULLISH" : this.ema < -0.08 ? "BEARISH" : "NEUTRAL";
    const r: StepRecord = {
      step: stepIdx, price: next.price, buyPressure: bp, sellPressure: sp, netDemand: bp - sp, demandRatio: ratio, volume: bp + sp,
      buyers: nb, sellers: ns, holders: nh, rejected: rej, capped: next.capped, sentiment: this.sentiment, events: this.active.map((a) => a.e.name).join(", "),
    };
    this.record(r);
    this.stepNo++;
    this.active.forEach((a) => a.remaining--);
    this.active = this.active.filter((a) => a.remaining > 0);
    return r;
  }

  /** Run `steps` more steps (or to the end). `schedule` maps a step number to an event to trigger. */
  run(steps?: number, schedule?: Record<number, EventKey>): this {
    const target = steps == null ? this.cfg.steps : Math.min(this.cfg.steps, this.stepNo + steps);
    while (this.stepNo < target) {
      const due = schedule?.[this.stepNo + 1];
      if (due) this.trigger(due);
      this.step();
    }
    return this;
  }

  private record(r: StepRecord): void {
    this.history.push(r);
    this.prices.push(r.price);
    const sums = new Map<StrategyName, { v: number; n: number }>();
    for (const t of this.traders) {
      const s = sums.get(t.strategy) ?? { v: 0, n: 0 };
      s.v += t.cash + t.shares * this.price;
      s.n++;
      sums.set(t.strategy, s);
    }
    for (const n of STRATEGY_NAMES) {
      const s = sums.get(n);
      this.growth[n].push(s ? s.v / s.n : null);
    }
  }

  traderRows(): TraderRow[] {
    const p = this.price;
    return this.traders.map((t) => {
      const v = t.cash + t.shares * p;
      return { trader: t.code, strategy: t.strategy, cash: t.cash, shares: t.shares, portfolioValue: v, profitLoss: v - t.initial, returnPct: (100 * (v - t.initial)) / t.initial, trades: t.trades, rejected: t.rejected, lastAction: ACTION_LABEL[t.last] };
    });
  }
}
