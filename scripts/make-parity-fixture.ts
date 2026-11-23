// Writes contracts/test/fixtures/parity-*.hex: rule params + synthetic Chainlink rounds + the site engine's decision at every bar,
// ABI-encoded. RutiqParity.t.sol replays them through RutiqDecisionLog and requires the same action, reason, cash and units.
// Run: npx tsx scripts/make-parity-fixture.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { encodeAbiParameters } from "viem";
import { RULE_PARAMS_TUPLE, paramsStruct } from "../src/lib/engine/abi";
import { backtest } from "../src/lib/engine/backtest";
import type { Round } from "../src/lib/engine/bars";
import { ALL_DAYS, ALL_HOURS, KIND, WEEKDAYS, type RuleParams } from "../src/lib/engine/rules";

const FEED = "0x00000000000000000000000000000000000feed1" as const;
const PHASE = 1n << 64n;
// 2026-10-01 00:00 UTC; the mock chain starts here.
const T0 = 1790812800;

// Deterministic generator (mulberry32).
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rounds at irregular times (some long silences, like a stock feed over a weekend), price a random walk. */
function makeRounds(seed: number, count: number, start: bigint): Round[] {
  const r = rng(seed);
  const out: Round[] = [];
  let t = T0;
  let p = start;
  for (let i = 1; i <= count; i++) {
    const gap = r() < 0.012 ? 3600 * (6 + Math.floor(r() * 40)) : 300 + Math.floor(r() * 3000);
    t += gap;
    const step = BigInt(Math.floor((r() - 0.49) * 300)); // about -1.47 % .. +1.53 %
    p = p + (p * step) / 10_000n;
    if (p < 1_000_000n) p = 1_000_000n;
    out.push({ id: PHASE | BigInt(i), answer: p, updatedAt: t });
  }
  return out;
}

type Case = { name: string; seed: number; count: number; start: bigint; params: RuleParams };
const base = {
  feed: FEED,
  maxStale: 6 * 3600,
  sizeBps: 5000,
  feeBps: 30,
  stopBps: 0,
  takeProfitBps: 0,
  maxEntriesPerDay: 0,
  hoursMask: ALL_HOURS,
  daysMask: ALL_DAYS,
  startCash: 10_000n * 1_000_000n,
} as const;
const none = { kind: KIND.NONE, a: 0, b: 0, value: 0n };

const CASES: Case[] = [
  {
    name: "sma-cross",
    seed: 7,
    count: 500,
    start: 1_700n * 10n ** 8n,
    params: { ...base, interval: 3600, entry: { kind: KIND.SMA_CROSS_UP, a: 5, b: 20, value: 0n }, exit: { kind: KIND.SMA_CROSS_DOWN, a: 5, b: 20, value: 0n }, stopBps: 300 },
  },
  {
    name: "dip-buy",
    seed: 11,
    count: 700,
    start: 180n * 10n ** 8n,
    params: {
      ...base,
      interval: 14_400,
      sizeBps: 10_000,
      entry: { kind: KIND.CHANGE_AT_MOST, a: 3, b: 0, value: -150n },
      exit: { kind: KIND.ABOVE_SMA, a: 12, b: 0, value: 0n },
      takeProfitBps: 400,
      stopBps: 500,
      maxEntriesPerDay: 1,
      daysMask: WEEKDAYS,
    },
  },
  {
    name: "breakout-schedule",
    seed: 23,
    count: 500,
    start: 450n * 10n ** 8n,
    params: {
      ...base,
      interval: 3600,
      maxStale: 2 * 3600,
      entry: { kind: KIND.CHANGE_AT_LEAST, a: 6, b: 0, value: 120n },
      exit: none,
      takeProfitBps: 250,
      stopBps: 150,
      maxEntriesPerDay: 2,
      hoursMask: 0b0000_0011_1111_1111_1100_0000, // 06:00..17:00 UTC closes
    },
  },
  {
    name: "price-levels",
    seed: 5,
    count: 1500,
    start: 600n * 10n ** 8n,
    params: { ...base, interval: 86_400, maxStale: 3 * 86_400, entry: { kind: KIND.PRICE_BELOW, a: 0, b: 0, value: 605n * 10n ** 8n }, exit: { kind: KIND.PRICE_ABOVE, a: 0, b: 0, value: 625n * 10n ** 8n }, feeBps: 0 },
  },
];

const ROUND = { type: "tuple[]", components: [{ name: "id", type: "uint80" }, { name: "answer", type: "int256" }, { name: "updatedAt", type: "uint64" }] } as const;
const STEP = {
  type: "tuple[]",
  components: [
    { name: "barEnd", type: "uint64" },
    { name: "roundIds", type: "uint80[]" },
    { name: "action", type: "uint8" },
    { name: "reason", type: "uint8" },
    { name: "cash", type: "uint128" },
    { name: "units", type: "uint128" },
  ],
} as const;

mkdirSync(new URL("../contracts/test/fixtures/", import.meta.url), { recursive: true });
for (const c of CASES) {
  const rounds = makeRounds(c.seed, c.count, c.start);
  const res = backtest(c.params, rounds, T0, rounds[rounds.length - 1].updatedAt);
  const hex = encodeAbiParameters(
    [RULE_PARAMS_TUPLE, ROUND, STEP, { type: "uint64" }],
    [
      paramsStruct(c.params),
      rounds.map((r) => ({ id: r.id, answer: r.answer, updatedAt: BigInt(r.updatedAt) })),
      res.steps.map((s) => ({ barEnd: BigInt(s.barEnd), roundIds: s.roundIds, action: s.action, reason: s.reason, cash: s.cash, units: s.units })),
      BigInt(T0),
    ],
  );
  writeFileSync(new URL(`../contracts/test/fixtures/parity-${c.name}.hex`, import.meta.url), hex);
  const counts = res.steps.reduce<Record<number, number>>((m, s) => ((m[s.reason] = (m[s.reason] ?? 0) + 1), m), {});
  console.log(c.name, "bars", res.steps.length, "entries", res.entries, "reasons", JSON.stringify(counts), "return bps", res.returnBps);
}
