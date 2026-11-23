import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { toFunctionSelector, type AbiFunction } from "viem";
import { DECISION_LOG_ABI, paramsHash } from "./abi";
import { backtest } from "./backtest";
import { closesAt, roundIndexAt, sortedRounds, type Round } from "./bars";
import { explainDecision } from "./explain";
import { PRESETS } from "./presets";
import { ACTION, ALL_DAYS, ALL_HOURS, KIND, REASON, applyFill, closesNeeded, decide, holds, initialState, ruleProblems, sma, utcWeekday, type RuleParams } from "./rules";

const FEED = "0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9" as const;
const T0 = 1_790_812_800; // Thu 2026-10-01 00:00 UTC
const P = (n: number) => BigInt(Math.round(n * 1e8));
const base = (): RuleParams => ({
  feed: FEED,
  interval: 3600,
  maxStale: 6 * 3600,
  sizeBps: 5000,
  feeBps: 30,
  stopBps: 0,
  takeProfitBps: 0,
  maxEntriesPerDay: 0,
  hoursMask: ALL_HOURS,
  daysMask: ALL_DAYS,
  startCash: 10_000_000_000n,
  entry: { kind: KIND.PRICE_BELOW, a: 0, b: 0, value: P(100) },
  exit: { kind: KIND.PRICE_ABOVE, a: 0, b: 0, value: P(110) },
});
const hourly = (prices: number[]): Round[] => prices.map((p, i) => ({ id: (1n << 64n) | BigInt(i + 1), answer: P(p), updatedAt: T0 - 1800 + i * 3600 }));

test("weekday of the epoch grid matches the contract (1970-01-01 was a Thursday)", () => {
  assert.equal(utcWeekday(T0), 4);
  assert.equal(utcWeekday(T0 + 3 * 86_400), 0);
});

test("sma truncates toward zero like Solidity", () => {
  assert.equal(sma([10n, 11n, 11n], 0, 3), 10n);
  assert.equal(sma([-10n, -11n, -11n], 0, 3), -10n);
});

test("every condition kind", () => {
  const c = [P(103), P(99), P(97), P(98), P(99)];
  assert.equal(holds({ kind: KIND.PRICE_ABOVE, a: 0, b: 0, value: P(102) }, c), true);
  assert.equal(holds({ kind: KIND.PRICE_BELOW, a: 0, b: 0, value: P(102) }, c), false);
  assert.equal(holds({ kind: KIND.SMA_CROSS_UP, a: 2, b: 4, value: 0n }, c), true);
  assert.equal(holds({ kind: KIND.SMA_CROSS_DOWN, a: 2, b: 4, value: 0n }, c), false);
  assert.equal(holds({ kind: KIND.CHANGE_AT_LEAST, a: 2, b: 0, value: 600n }, c), true); // +6.19 %
  assert.equal(holds({ kind: KIND.CHANGE_AT_LEAST, a: 2, b: 0, value: 700n }, c), false);
  assert.equal(holds({ kind: KIND.CHANGE_AT_MOST, a: 1, b: 0, value: 500n }, c), true);
  assert.equal(holds({ kind: KIND.ABOVE_SMA, a: 4, b: 0, value: 0n }, c), true);
  assert.equal(holds({ kind: KIND.BELOW_SMA, a: 4, b: 0, value: 0n }, c), false);
});

test("closes needed per rule", () => {
  const p = base();
  assert.equal(closesNeeded(p), 1);
  p.entry = { kind: KIND.SMA_CROSS_UP, a: 5, b: 20, value: 0n };
  assert.equal(closesNeeded(p), 21);
  p.exit = { kind: KIND.CHANGE_AT_MOST, a: 30, b: 0, value: -100n };
  assert.equal(closesNeeded(p), 31);
});

test("rule problems mirror the contract's validation", () => {
  assert.deepEqual(ruleProblems(base()), []);
  const p = base();
  p.interval = 60;
  p.entry = { kind: KIND.SMA_CROSS_UP, a: 20, b: 5, value: 0n };
  p.daysMask = 0;
  assert.equal(ruleProblems(p).length, 3);
});

test("round at a time: latest round with updatedAt <= t", () => {
  const r = hourly([1, 2, 3]);
  assert.equal(roundIndexAt(r, T0 - 1801), -1);
  assert.equal(roundIndexAt(r, T0 - 1800), 0);
  assert.equal(roundIndexAt(r, T0), 0);
  assert.equal(roundIndexAt(r, T0 + 1800), 1);
  assert.equal(roundIndexAt(r, T0 + 99_999), 2);
  assert.equal(closesAt(r, T0 + 3600, 3600, 3), null);
  assert.deepEqual(
    closesAt(r, T0 + 3600, 3600, 2)!.map((c) => c.round.answer),
    [P(2), P(1)],
  );
  assert.throws(() => sortedRounds([r[1], { ...r[0], updatedAt: T0 + 99_999 }]));
});

test("buy, hold, sell with the contract's accounting", () => {
  const p = base();
  let s = initialState(p);
  let d = decide(p, s, [P(99)], T0 + 3600, 1800);
  assert.deepEqual(d, { action: ACTION.BUY, reason: REASON.ENTRY_RULE });
  s = applyFill(p, s, d.action, P(99), T0 + 3600).state;
  assert.equal(s.cash, 5_000_000_000n);
  assert.equal(s.units, (4_985_000_000n * 10n ** 20n) / P(99));
  assert.equal(s.feesPaid, 15_000_000n);
  d = decide(p, s, [P(111)], T0 + 7200, 100);
  assert.deepEqual(d, { action: ACTION.SELL, reason: REASON.EXIT_RULE });
  const after = applyFill(p, s, d.action, P(111), T0 + 7200).state;
  const gross = (s.units * P(111)) / 10n ** 20n;
  assert.equal(after.cash, 5_000_000_000n + gross - (gross * 30n) / 10_000n);
});

test("stale price, schedule and daily limit", () => {
  const p = base();
  p.maxStale = 3600;
  const s = initialState(p);
  assert.equal(decide(p, s, [P(99)], T0, 3601).reason, REASON.STALE_PRICE);
  p.hoursMask = 1 << 5;
  assert.equal(decide(p, s, [P(99)], T0, 0).reason, REASON.OUT_OF_SCHEDULE);
  p.hoursMask = ALL_HOURS;
  p.maxEntriesPerDay = 1;
  const s2 = { ...s, entryDay: Math.floor(T0 / 86_400), entriesToday: 1 };
  assert.equal(decide(p, s2, [P(99)], T0 + 3600, 0).reason, REASON.DAILY_LIMIT);
});

test("backtest: equity, fees, drawdown and buy-and-hold on a tiny series", () => {
  const r = hourly([104, 99, 101, 108, 111, 109, 98, 97]);
  const res = backtest(base(), r, T0 - 1, T0 + 7 * 3600);
  assert.equal(res.steps.length, 8);
  assert.deepEqual(
    res.steps.map((s) => s.action),
    [0, 1, 0, 0, 2, 0, 1, 0],
  );
  assert.equal(res.entries, 2);
  assert.equal(res.wins, 1);
  assert.ok(res.fees > 0n);
  assert.ok(res.maxDrawdownBps > 0);
  // buy and hold from 104 to 97 after a 0.3 % entry fee: about -7 %
  assert.ok(res.buyHoldBps < -690 && res.buyHoldBps > -710);
  assert.equal(res.steps[1].roundIds.length, 1);
});

test("backtest marks bars without enough history as warming up", () => {
  const p = base();
  p.entry = { kind: KIND.ABOVE_SMA, a: 4, b: 0, value: 0n };
  const res = backtest(p, hourly([1, 2, 3, 4, 5, 6]), T0 - 1, T0 + 5 * 3600);
  assert.equal(res.warmupBars, 3);
  assert.equal(res.steps.length, 3);
});

test("explanations name the values", () => {
  const p = base();
  const t = explainDecision(p, REASON.WAITING_ENTRY, [P(104)], T0, 0, null);
  assert.match(t, /\$104\.00/);
  assert.match(t, /\$100\.00/);
});

test("presets are all valid rules", () => {
  for (const pr of PRESETS) assert.deepEqual(ruleProblems(pr.build(FEED, P(1700))), [], pr.id);
});

test("the site's ABI matches the compiled contract", () => {
  const art = JSON.parse(readFileSync(new URL("../contracts/artifacts.json", import.meta.url), "utf8")).contracts.RutiqDecisionLog.abi as AbiFunction[];
  const sig = (f: AbiFunction) => toFunctionSelector(f);
  const compiled = new Set(art.filter((x) => x.type === "function").map(sig));
  for (const f of DECISION_LOG_ABI.filter((x) => x.type === "function")) assert.ok(compiled.has(sig(f as AbiFunction)), `missing ${f.name}`);
  assert.match(paramsHash(base()), /^0x[0-9a-f]{64}$/);
});

test("real data: a preset runs over the bundled ETH/USD round history", () => {
  const f = JSON.parse(readFileSync(new URL("../../data/rounds/ETH.json", import.meta.url), "utf8")) as { rounds: [number, string, number][] };
  const rounds = sortedRounds(f.rounds.map(([id, a, u]) => ({ id: (1n << 64n) | BigInt(id), answer: BigInt(a), updatedAt: u })));
  assert.ok(rounds.length > 3000);
  const last = rounds[rounds.length - 1].updatedAt;
  const res = backtest(PRESETS[0].build(FEED, rounds[rounds.length - 1].answer), rounds, last - 30 * 86_400, last);
  assert.ok(res.steps.length > 600);
  assert.ok(res.steps.every((s) => s.roundIds.length === 25));
});
