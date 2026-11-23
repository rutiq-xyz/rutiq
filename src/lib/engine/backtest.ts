// Backtest = the same decide/applyFill the contract runs, over every bar in a window of proven Chainlink history.
import { alignDown, closesAt, type Round } from "./bars";
import { ACTION, REASON, applyFill, closesNeeded, decide, equity, initialState, type Action, type PaperState, type Reason, type RuleParams } from "./rules";

export type Step = {
  barEnd: number;
  roundId: bigint;
  price: bigint;
  /** seconds between the close's round and the bar end */
  age: number;
  action: Action;
  reason: Reason;
  /** round ids of every close the decision used, newest first (what a commit sends) */
  roundIds: bigint[];
  closes: bigint[];
  equity: bigint;
  cash: bigint;
  units: bigint;
  fee: bigint;
};

export type Trade = { entryBar: number; entryPrice: bigint; exitBar: number | null; exitPrice: bigint | null; exitReason: Reason | null; pnl: bigint | null };

export type BacktestResult = {
  steps: Step[];
  trades: Trade[];
  start: number;
  end: number;
  startCash: bigint;
  final: bigint;
  /** micro-dollars, both sides */
  fees: bigint;
  /** basis points (negative = loss) */
  returnBps: number;
  buyHoldFinal: bigint;
  buyHoldBps: number;
  /** largest peak-to-trough fall of equity, in basis points (positive number) */
  maxDrawdownBps: number;
  buyHoldDrawdownBps: number;
  entries: number;
  wins: number;
  warmupBars: number;
  staleBars: number;
  state: PaperState;
};

function bpsOf(a: bigint, b: bigint): number {
  if (b === 0n) return 0;
  return Number(((a - b) * 10_000n) / b);
}

/**
 * Runs the rule over every bar ending in (from, to]. Bars whose look-back reaches before the first round are WARMING_UP (no action).
 * Buy-and-hold: the whole starting cash bought at the first evaluated close with the same entry fee, marked at the last close.
 */
export function backtest(p: RuleParams, history: Round[], from: number, to: number): BacktestResult {
  const n = closesNeeded(p);
  const first = alignDown(from, p.interval) + p.interval;
  const last = alignDown(to, p.interval);
  let s = initialState(p);
  const steps: Step[] = [];
  const trades: Trade[] = [];
  let open: Trade | null = null;
  let peak = p.startCash;
  let maxDd = 0;
  let bhUnits: bigint | null = null;
  let bhPeak = 0n;
  let bhDd = 0;
  let lastPrice = 0n;
  let warm = 0;
  let stale = 0;
  for (let t = first; t <= last; t += p.interval) {
    const cl = closesAt(history, t, p.interval, n);
    if (!cl) {
      warm++;
      continue;
    }
    const closes = cl.map((c) => c.round.answer);
    const price = closes[0];
    lastPrice = price;
    const { action, reason } = decide(p, s, closes, t, cl[0].age);
    if (reason === REASON.STALE_PRICE) stale++;
    const r = applyFill(p, s, action, price, t);
    s = r.state;
    if (action === ACTION.BUY) open = { entryBar: t, entryPrice: price, exitBar: null, exitPrice: null, exitReason: null, pnl: null };
    if (action === ACTION.SELL && open) {
      open.exitBar = t;
      open.exitPrice = price;
      open.exitReason = reason;
      open.pnl = (price - open.entryPrice) * 10_000n / open.entryPrice;
      trades.push(open);
      open = null;
    }
    const eq = equity(s, price);
    if (eq > peak) peak = eq;
    const dd = peak > 0n ? Number(((peak - eq) * 10_000n) / peak) : 0;
    if (dd > maxDd) maxDd = dd;
    if (bhUnits === null) {
      const fee = (p.startCash * BigInt(p.feeBps)) / 10_000n;
      bhUnits = ((p.startCash - fee) * 10n ** 20n) / price;
    }
    const bh = (bhUnits * price) / 10n ** 20n;
    if (bh > bhPeak) bhPeak = bh;
    const bdd = bhPeak > 0n ? Number(((bhPeak - bh) * 10_000n) / bhPeak) : 0;
    if (bdd > bhDd) bhDd = bdd;
    steps.push({ barEnd: t, roundId: cl[0].round.id, price, age: cl[0].age, action, reason, roundIds: cl.map((c) => c.round.id), closes, equity: eq, cash: s.cash, units: s.units, fee: r.fee });
  }
  if (open) trades.push(open);
  const final = steps.length ? steps[steps.length - 1].equity : p.startCash;
  const bhGross = bhUnits === null ? p.startCash : (bhUnits * lastPrice) / 10n ** 20n;
  // Both sides are marked at the last close before any exit fee (an open strategy position is valued the same way).
  const buyHoldFinal = bhGross;
  const closed = trades.filter((t) => t.pnl !== null);
  return {
    steps,
    trades,
    start: first,
    end: last,
    startCash: p.startCash,
    final,
    fees: s.feesPaid,
    returnBps: bpsOf(final, p.startCash),
    buyHoldFinal,
    buyHoldBps: bpsOf(buyHoldFinal, p.startCash),
    maxDrawdownBps: maxDd,
    buyHoldDrawdownBps: bhDd,
    entries: trades.length,
    wins: closed.filter((t) => (t.pnl ?? 0n) > 0n).length,
    warmupBars: warm,
    staleBars: stale,
    state: s,
  };
}
