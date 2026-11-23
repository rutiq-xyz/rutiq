// The rule builder's editable form <-> RuleParams. Forms are plain JSON (prices as dollar strings, percents as numbers) so they
// can live in localStorage and in an exported spec file.
import { ALL_DAYS, ALL_HOURS, KIND, type Condition, type Kind, type RuleParams } from "./rules";

export type CondForm = { kind: Kind; a: number; b: number; /** dollars for price kinds, percent for change kinds */ value: string };

export type RuleForm = {
  v: 1;
  name: string;
  market: string;
  feed: `0x${string}`;
  interval: number;
  entry: CondForm;
  exit: CondForm;
  sizePct: number;
  feePct: number;
  stopPct: number;
  takeProfitPct: number;
  maxEntriesPerDay: number;
  maxStaleHours: number;
  hoursMask: number;
  daysMask: number;
  startCash: number;
};

const isPriceKind = (k: Kind) => k === KIND.PRICE_ABOVE || k === KIND.PRICE_BELOW;
const isChangeKind = (k: Kind) => k === KIND.CHANGE_AT_LEAST || k === KIND.CHANGE_AT_MOST;

/** "1,712.5" -> 171250000000n (8 decimals); null when not a positive number. */
export function dollarsTo8(s: string): bigint | null {
  const t = s.replace(/[,$\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  return BigInt(w) * 10n ** 8n + BigInt((f + "00000000").slice(0, 8));
}
export const from8 = (v: bigint) => {
  const w = v / 10n ** 8n;
  const f = (v % 10n ** 8n).toString().padStart(8, "0").replace(/0+$/, "");
  return f ? `${w}.${f.slice(0, 4)}` : `${w}`;
};

export function condToParams(c: CondForm): Condition {
  let value = 0n;
  if (isPriceKind(c.kind)) value = dollarsTo8(c.value) ?? 0n;
  else if (isChangeKind(c.kind)) {
    const n = Number(c.value);
    value = Number.isFinite(n) ? BigInt(Math.round(n * 100)) : 0n;
  }
  return { kind: c.kind, a: Math.round(c.a) || 0, b: Math.round(c.b) || 0, value };
}

export function condToForm(c: Condition): CondForm {
  return { kind: c.kind, a: c.a, b: c.b, value: isPriceKind(c.kind) ? from8(c.value) : isChangeKind(c.kind) ? String(Number(c.value) / 100) : "" };
}

const bps = (pct: number) => Math.max(0, Math.round((Number.isFinite(pct) ? pct : 0) * 100));

export function formToParams(f: RuleForm): RuleParams {
  return {
    feed: f.feed,
    interval: f.interval,
    maxStale: Math.round((Number.isFinite(f.maxStaleHours) ? f.maxStaleHours : 0) * 3600),
    sizeBps: bps(f.sizePct),
    feeBps: bps(f.feePct),
    stopBps: bps(f.stopPct),
    takeProfitBps: bps(f.takeProfitPct),
    maxEntriesPerDay: Math.max(0, Math.round(f.maxEntriesPerDay) || 0),
    hoursMask: f.hoursMask,
    daysMask: f.daysMask,
    startCash: BigInt(Math.max(0, Math.round(Number.isFinite(f.startCash) ? f.startCash : 0))) * 1_000_000n,
    entry: condToParams(f.entry),
    exit: condToParams(f.exit),
  };
}

export function paramsToForm(p: RuleParams, market: string, name: string): RuleForm {
  return {
    v: 1,
    name,
    market,
    feed: p.feed,
    interval: p.interval,
    entry: condToForm(p.entry),
    exit: condToForm(p.exit),
    sizePct: p.sizeBps / 100,
    feePct: p.feeBps / 100,
    stopPct: p.stopBps / 100,
    takeProfitPct: p.takeProfitBps / 100,
    maxEntriesPerDay: p.maxEntriesPerDay,
    maxStaleHours: p.maxStale / 3600,
    hoursMask: p.hoursMask,
    daysMask: p.daysMask,
    startCash: Number(p.startCash / 1_000_000n),
  };
}

/** Accepts only a well-formed saved form (anything else = null), so a damaged localStorage value never crashes a page. */
export function parseForm(raw: unknown): RuleForm | null {
  const f = raw as RuleForm;
  if (!f || typeof f !== "object" || f.v !== 1) return null;
  if (typeof f.market !== "string" || typeof f.feed !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(f.feed)) return null;
  const cond = (c: CondForm) => c && typeof c === "object" && Number.isInteger(c.kind) && c.kind >= 0 && c.kind <= 8 && typeof c.value === "string";
  if (!cond(f.entry) || !cond(f.exit)) return null;
  for (const k of ["interval", "sizePct", "feePct", "stopPct", "takeProfitPct", "maxEntriesPerDay", "maxStaleHours", "hoursMask", "daysMask", "startCash"] as const)
    if (typeof f[k] !== "number" || !Number.isFinite(f[k])) return null;
  return { ...f, name: typeof f.name === "string" ? f.name.slice(0, 60) : "Untitled rule" };
}

export const DEFAULT_MASKS = { hoursMask: ALL_HOURS, daysMask: ALL_DAYS };
