// Rule evaluation and paper accounting. Integer math that mirrors contracts/src/RutiqRuleMath.sol line for line, so a decision the
// site shows is the decision the contract accepts (parity fixtures: contracts/test/fixtures, made by scripts/make-parity-fixture.ts).
// BigInt division truncates toward zero, like Solidity.

export const KIND = {
  NONE: 0,
  PRICE_ABOVE: 1,
  PRICE_BELOW: 2,
  SMA_CROSS_UP: 3,
  SMA_CROSS_DOWN: 4,
  CHANGE_AT_LEAST: 5,
  CHANGE_AT_MOST: 6,
  ABOVE_SMA: 7,
  BELOW_SMA: 8,
} as const;
export type Kind = (typeof KIND)[keyof typeof KIND];

export const ACTION = { HOLD: 0, BUY: 1, SELL: 2 } as const;
export type Action = (typeof ACTION)[keyof typeof ACTION];

export const REASON = {
  ENTRY_RULE: 1,
  EXIT_RULE: 2,
  STOP_LOSS: 3,
  TAKE_PROFIT: 4,
  WAITING_ENTRY: 5,
  IN_POSITION: 6,
  DAILY_LIMIT: 7,
  OUT_OF_SCHEDULE: 8,
  STALE_PRICE: 9,
  /** Site only: not enough history yet for the look-back. Never committed (the contract cannot prove a missing round). */
  WARMING_UP: 10,
} as const;
export type Reason = (typeof REASON)[keyof typeof REASON];

export const MAX_LOOKBACK = 48;
export const BPS = 10_000n;
export const FEED_DECIMALS = 8;
/** units (1e18) = net micro-dollars * SCALE / price; value (micro-dollars) = units * price / SCALE. */
export const SCALE = 10n ** 20n;
export const INTERVALS = [3600, 14_400, 86_400] as const;

export type Condition = { kind: Kind; a: number; b: number; value: bigint };

export type RuleParams = {
  feed: `0x${string}`;
  interval: number;
  maxStale: number;
  sizeBps: number;
  feeBps: number;
  stopBps: number;
  takeProfitBps: number;
  maxEntriesPerDay: number;
  hoursMask: number;
  daysMask: number;
  /** micro-dollars */
  startCash: bigint;
  entry: Condition;
  exit: Condition;
};

export type PaperState = {
  cash: bigint;
  units: bigint;
  feesPaid: bigint;
  entryPrice: bigint;
  lastBar: number;
  entryDay: number;
  entriesToday: number;
  inPosition: boolean;
  decisions: number;
};

export const ALL_HOURS = 0xffffff;
export const ALL_DAYS = 0x7f;
export const WEEKDAYS = 0b0111110; // Mon..Fri

export function initialState(p: RuleParams): PaperState {
  return { cash: p.startCash, units: 0n, feesPaid: 0n, entryPrice: 0n, lastBar: 0, entryDay: 0, entriesToday: 0, inPosition: false, decisions: 0 };
}

export function closesNeededFor(c: Condition): number {
  switch (c.kind) {
    case KIND.NONE:
    case KIND.PRICE_ABOVE:
    case KIND.PRICE_BELOW:
      return 1;
    case KIND.SMA_CROSS_UP:
    case KIND.SMA_CROSS_DOWN:
      return c.b + 1;
    case KIND.CHANGE_AT_LEAST:
    case KIND.CHANGE_AT_MOST:
      return c.a + 1;
    default:
      return c.a;
  }
}

export function closesNeeded(p: RuleParams): number {
  return Math.max(closesNeededFor(p.entry), closesNeededFor(p.exit));
}

export function conditionProblem(c: Condition, allowNone: boolean): string | null {
  const k = c.kind;
  if (k < 0 || k > 8) return "Unknown condition.";
  if (k === KIND.NONE) return allowNone ? null : "An entry condition is required.";
  if (k === KIND.PRICE_ABOVE || k === KIND.PRICE_BELOW) return c.value > 0n ? null : "The price level must be above zero.";
  if (k === KIND.SMA_CROSS_UP || k === KIND.SMA_CROSS_DOWN)
    return c.a >= 1 && c.a < c.b && c.b <= MAX_LOOKBACK ? null : `Fast average must be shorter than the slow one, slow at most ${MAX_LOOKBACK} bars.`;
  if (k === KIND.CHANGE_AT_LEAST || k === KIND.CHANGE_AT_MOST)
    return c.a >= 1 && c.a <= MAX_LOOKBACK && c.value > -10_000n && c.value < 1_000_000n ? null : `Look-back 1 to ${MAX_LOOKBACK} bars, change above -100 %.`;
  return c.a >= 2 && c.a <= MAX_LOOKBACK ? null : `Average length 2 to ${MAX_LOOKBACK} bars.`;
}

/** Same checks as RutiqRuleMath.validate, as readable messages. Empty list = the contract accepts the rule. */
export function ruleProblems(p: RuleParams): string[] {
  const out: string[] = [];
  if (!(INTERVALS as readonly number[]).includes(p.interval)) out.push("Bar length must be 1 hour, 4 hours or 1 day.");
  if (p.maxStale <= 0 || p.maxStale > 30 * 86_400) out.push("Stale-price limit must be between 1 second and 30 days.");
  if (p.sizeBps <= 0 || p.sizeBps > 10_000) out.push("Position size must be 0.01 % to 100 % of cash.");
  if (p.feeBps < 0 || p.feeBps > 1000) out.push("Fee + slippage must be 0 to 10 %.");
  if (p.stopBps < 0 || p.stopBps >= 10_000) out.push("Stop-loss must be below 100 %.");
  if (p.takeProfitBps < 0 || p.takeProfitBps > 100_000) out.push("Take-profit must be at most 1,000 %.");
  if (p.hoursMask === 0 || p.daysMask === 0 || p.daysMask > 0x7f) out.push("Pick at least one hour and one weekday.");
  if (p.startCash < 1_000_000n || p.startCash > 10n ** 15n) out.push("Starting paper cash must be $1 to $1,000,000,000.");
  if (p.maxEntriesPerDay < 0 || p.maxEntriesPerDay > 255) out.push("Max entries per day must be 0 to 255.");
  const e = conditionProblem(p.entry, false);
  if (e) out.push(`Entry: ${e}`);
  const x = conditionProblem(p.exit, true);
  if (x) out.push(`Exit: ${x}`);
  return out;
}

export function sma(closes: bigint[], offset: number, n: number): bigint {
  let s = 0n;
  for (let i = offset; i < offset + n; i++) s += closes[i];
  return s / BigInt(n);
}

export function holds(c: Condition, closes: bigint[]): boolean {
  const c0 = closes[0];
  switch (c.kind) {
    case KIND.PRICE_ABOVE:
      return c0 > c.value;
    case KIND.PRICE_BELOW:
      return c0 < c.value;
    case KIND.SMA_CROSS_UP:
    case KIND.SMA_CROSS_DOWN: {
      const f0 = sma(closes, 0, c.a);
      const s0 = sma(closes, 0, c.b);
      const f1 = sma(closes, 1, c.a);
      const s1 = sma(closes, 1, c.b);
      return c.kind === KIND.SMA_CROSS_UP ? f0 > s0 && f1 <= s1 : f0 < s0 && f1 >= s1;
    }
    case KIND.CHANGE_AT_LEAST:
    case KIND.CHANGE_AT_MOST: {
      const base = closes[c.a];
      const lhs = (c0 - base) * BPS;
      const rhs = c.value * base;
      return c.kind === KIND.CHANGE_AT_LEAST ? lhs >= rhs : lhs <= rhs;
    }
    case KIND.ABOVE_SMA:
      return c0 > sma(closes, 0, c.a);
    case KIND.BELOW_SMA:
      return c0 < sma(closes, 0, c.a);
    default:
      return false;
  }
}

export function utcHour(barEnd: number) {
  return Math.floor(barEnd / 3600) % 24;
}
/** 0 = Sunday. 1970-01-01 was a Thursday. */
export function utcWeekday(barEnd: number) {
  return (Math.floor(barEnd / 86_400) + 4) % 7;
}

export function decide(p: RuleParams, s: PaperState, closes: bigint[], barEnd: number, closeAge: number): { action: Action; reason: Reason } {
  if (((p.hoursMask >> utcHour(barEnd)) & 1) === 0 || ((p.daysMask >> utcWeekday(barEnd)) & 1) === 0)
    return { action: ACTION.HOLD, reason: REASON.OUT_OF_SCHEDULE };
  if (closeAge > p.maxStale) return { action: ACTION.HOLD, reason: REASON.STALE_PRICE };
  const c0 = closes[0];
  if (s.inPosition) {
    const entry = s.entryPrice;
    if (p.stopBps > 0 && c0 * BPS <= entry * (BPS - BigInt(p.stopBps))) return { action: ACTION.SELL, reason: REASON.STOP_LOSS };
    if (p.takeProfitBps > 0 && c0 * BPS >= entry * (BPS + BigInt(p.takeProfitBps))) return { action: ACTION.SELL, reason: REASON.TAKE_PROFIT };
    if (p.exit.kind !== KIND.NONE && holds(p.exit, closes)) return { action: ACTION.SELL, reason: REASON.EXIT_RULE };
    return { action: ACTION.HOLD, reason: REASON.IN_POSITION };
  }
  const day = Math.floor(barEnd / 86_400);
  const today = s.entryDay === day ? s.entriesToday : 0;
  if (p.maxEntriesPerDay > 0 && today >= p.maxEntriesPerDay) return { action: ACTION.HOLD, reason: REASON.DAILY_LIMIT };
  if (holds(p.entry, closes)) return { action: ACTION.BUY, reason: REASON.ENTRY_RULE };
  return { action: ACTION.HOLD, reason: REASON.WAITING_ENTRY };
}

/** Returns the new state and the fee charged by this fill (0 for HOLD). */
export function applyFill(p: RuleParams, prev: PaperState, action: Action, price: bigint, barEnd: number): { state: PaperState; fee: bigint } {
  const s = { ...prev };
  let fee = 0n;
  if (action === ACTION.BUY) {
    const spend = (s.cash * BigInt(p.sizeBps)) / BPS;
    fee = (spend * BigInt(p.feeBps)) / BPS;
    const net = spend - fee;
    s.units = (net * SCALE) / price;
    s.cash -= spend;
    s.feesPaid += fee;
    s.inPosition = true;
    s.entryPrice = price;
    const day = Math.floor(barEnd / 86_400);
    if (s.entryDay === day) s.entriesToday += 1;
    else {
      s.entryDay = day;
      s.entriesToday = 1;
    }
  } else if (action === ACTION.SELL) {
    const gross = (s.units * price) / SCALE;
    fee = (gross * BigInt(p.feeBps)) / BPS;
    s.cash += gross - fee;
    s.feesPaid += fee;
    s.units = 0n;
    s.inPosition = false;
    s.entryPrice = 0n;
  }
  s.lastBar = barEnd;
  s.decisions += 1;
  return { state: s, fee };
}

export function equity(s: PaperState, price: bigint): bigint {
  return s.cash + (s.units * price) / SCALE;
}
