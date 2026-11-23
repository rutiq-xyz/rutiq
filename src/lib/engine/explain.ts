// Plain-English descriptions of rules and of each decision, with the indicator values the decision used.
import { ACTION, BPS, KIND, REASON, sma, utcHour, utcWeekday, type Action, type Condition, type Reason, type RuleParams } from "./rules";

export const price8 = (v: bigint) => Number(v) / 1e8;

export function usd(v: number, digits?: number) {
  const d = digits ?? (Math.abs(v) >= 1000 ? 2 : Math.abs(v) >= 1 ? 2 : 4);
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}
export const usdPrice = (v: bigint) => usd(price8(v));
export const micro = (v: bigint) => Number(v) / 1e6;
export const pct = (bps: number, sign = false) => `${sign && bps > 0 ? "+" : ""}${(bps / 100).toFixed(2)} %`;

export const ACTION_LABEL: Record<Action, string> = { [ACTION.HOLD]: "Hold", [ACTION.BUY]: "Buy", [ACTION.SELL]: "Sell" };

export const REASON_LABEL: Record<Reason, string> = {
  [REASON.ENTRY_RULE]: "Entry rule met",
  [REASON.EXIT_RULE]: "Exit rule met",
  [REASON.STOP_LOSS]: "Stop-loss hit",
  [REASON.TAKE_PROFIT]: "Take-profit hit",
  [REASON.WAITING_ENTRY]: "Waiting for entry",
  [REASON.IN_POSITION]: "Holding, no exit yet",
  [REASON.DAILY_LIMIT]: "Daily entry limit reached",
  [REASON.OUT_OF_SCHEDULE]: "Outside the schedule",
  [REASON.STALE_PRICE]: "Price too old",
  [REASON.WARMING_UP]: "Warming up",
};

const bars = (n: number, interval: number) => {
  const h = (n * interval) / 3600;
  const span = h >= 48 && h % 24 === 0 ? `${h / 24} days` : `${h} h`;
  return `${n} bar${n === 1 ? "" : "s"} (${span})`;
};

export function describeCondition(c: Condition, interval: number): string {
  switch (c.kind) {
    case KIND.NONE:
      return "No exit rule (stop-loss / take-profit only)";
    case KIND.PRICE_ABOVE:
      return `Close above ${usdPrice(c.value)}`;
    case KIND.PRICE_BELOW:
      return `Close below ${usdPrice(c.value)}`;
    case KIND.SMA_CROSS_UP:
      return `${c.a}-bar average crosses above the ${c.b}-bar average`;
    case KIND.SMA_CROSS_DOWN:
      return `${c.a}-bar average crosses below the ${c.b}-bar average`;
    case KIND.CHANGE_AT_LEAST:
      return `Close changed by ${pct(Number(c.value), true)} or more over ${bars(c.a, interval)}`;
    case KIND.CHANGE_AT_MOST:
      return `Close changed by ${pct(Number(c.value), true)} or less over ${bars(c.a, interval)}`;
    case KIND.ABOVE_SMA:
      return `Close above its ${c.a}-bar average`;
    case KIND.BELOW_SMA:
      return `Close below its ${c.a}-bar average`;
    default:
      return "Unknown condition";
  }
}

/** The numbers a condition looks at, for the decision log ("5-bar avg $1,712.40 vs 20-bar avg $1,698.10"). */
export function conditionValues(c: Condition, closes: bigint[]): string {
  if (!closes.length) return "";
  const c0 = closes[0];
  switch (c.kind) {
    case KIND.PRICE_ABOVE:
    case KIND.PRICE_BELOW:
      return `close ${usdPrice(c0)} vs level ${usdPrice(c.value)}`;
    case KIND.SMA_CROSS_UP:
    case KIND.SMA_CROSS_DOWN:
      if (closes.length < c.b + 1) return "";
      return `${c.a}-bar avg ${usdPrice(sma(closes, 0, c.a))} vs ${c.b}-bar avg ${usdPrice(sma(closes, 0, c.b))} (bar before: ${usdPrice(sma(closes, 1, c.a))} vs ${usdPrice(sma(closes, 1, c.b))})`;
    case KIND.CHANGE_AT_LEAST:
    case KIND.CHANGE_AT_MOST: {
      if (closes.length < c.a + 1) return "";
      const base = closes[c.a];
      const ch = Number(((c0 - base) * BPS) / base);
      return `change ${pct(ch, true)} (${usdPrice(base)} → ${usdPrice(c0)}) vs ${pct(Number(c.value), true)}`;
    }
    case KIND.ABOVE_SMA:
    case KIND.BELOW_SMA:
      if (closes.length < c.a) return "";
      return `close ${usdPrice(c0)} vs ${c.a}-bar avg ${usdPrice(sma(closes, 0, c.a))}`;
    default:
      return "";
  }
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** One sentence saying why the agent acted or waited at this bar. */
export function explainDecision(p: RuleParams, reason: Reason, closes: bigint[], barEnd: number, age: number, entryPrice: bigint | null): string {
  switch (reason) {
    case REASON.ENTRY_RULE:
      return `Bought: ${describeCondition(p.entry, p.interval).toLowerCase()} — ${conditionValues(p.entry, closes)}.`;
    case REASON.EXIT_RULE:
      return `Sold: ${describeCondition(p.exit, p.interval).toLowerCase()} — ${conditionValues(p.exit, closes)}.`;
    case REASON.STOP_LOSS:
      return `Sold: close ${usdPrice(closes[0])} fell ${pct(p.stopBps)} or more below the entry ${entryPrice ? usdPrice(entryPrice) : ""}.`;
    case REASON.TAKE_PROFIT:
      return `Sold: close ${usdPrice(closes[0])} rose ${pct(p.takeProfitBps)} or more above the entry ${entryPrice ? usdPrice(entryPrice) : ""}.`;
    case REASON.WAITING_ENTRY:
      return `Waited: entry rule not met — ${conditionValues(p.entry, closes)}.`;
    case REASON.IN_POSITION: {
      const ex = p.exit.kind === KIND.NONE ? "no exit rule set" : `exit rule not met — ${conditionValues(p.exit, closes)}`;
      return `Held: stop and take-profit not hit, ${ex}.`;
    }
    case REASON.DAILY_LIMIT:
      return `Waited: already ${p.maxEntriesPerDay} entr${p.maxEntriesPerDay === 1 ? "y" : "ies"} today (UTC), the daily limit.`;
    case REASON.OUT_OF_SCHEDULE:
      return `Waited: ${DAYS[utcWeekday(barEnd)]} ${String(utcHour(barEnd)).padStart(2, "0")}:00 UTC is outside the rule's schedule.`;
    case REASON.STALE_PRICE:
      return `Waited: the latest price round was ${fmtAge(age)} old at the bar close, over the ${fmtAge(p.maxStale)} limit (market closed or feed quiet).`;
    case REASON.WARMING_UP:
      return "Waited: not enough price history yet for the rule's look-back.";
    default:
      return "";
  }
}

export function fmtAge(sec: number) {
  if (sec < 90) return `${Math.max(0, Math.round(sec))} s`;
  if (sec < 5400) return `${Math.round(sec / 60)} min`;
  if (sec < 172_800) return `${(sec / 3600).toFixed(1)} h`;
  return `${(sec / 86_400).toFixed(1)} days`;
}

export const fmtBar = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
