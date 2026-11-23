// ABI shapes of RutiqDecisionLog / RutiqRuleMath shared by the site, the parity fixture generator and the deploy page.
import { encodeAbiParameters, keccak256, toHex } from "viem";
import type { Condition, RuleParams } from "./rules";

export const CONDITION_COMPONENTS = [
  { name: "kind", type: "uint8" },
  { name: "a", type: "uint8" },
  { name: "b", type: "uint8" },
  { name: "value", type: "int64" },
] as const;

export const RULE_PARAMS_COMPONENTS = [
  { name: "feed", type: "address" },
  { name: "interval", type: "uint32" },
  { name: "maxStale", type: "uint32" },
  { name: "sizeBps", type: "uint16" },
  { name: "feeBps", type: "uint16" },
  { name: "stopBps", type: "uint16" },
  { name: "takeProfitBps", type: "uint32" },
  { name: "maxEntriesPerDay", type: "uint8" },
  { name: "hoursMask", type: "uint24" },
  { name: "daysMask", type: "uint8" },
  { name: "startCash", type: "uint64" },
  { name: "entry", type: "tuple", components: CONDITION_COMPONENTS },
  { name: "exit", type: "tuple", components: CONDITION_COMPONENTS },
] as const;

export const RULE_PARAMS_TUPLE = { name: "params", type: "tuple", components: RULE_PARAMS_COMPONENTS } as const;

const cond = (c: Condition) => ({ kind: c.kind, a: c.a, b: c.b, value: c.value });

/** The struct as viem expects it for writeContract / encodeAbiParameters. */
export function paramsStruct(p: RuleParams) {
  return {
    feed: p.feed,
    interval: p.interval,
    maxStale: p.maxStale,
    sizeBps: p.sizeBps,
    feeBps: p.feeBps,
    stopBps: p.stopBps,
    takeProfitBps: p.takeProfitBps,
    maxEntriesPerDay: p.maxEntriesPerDay,
    hoursMask: p.hoursMask,
    daysMask: p.daysMask,
    startCash: p.startCash,
    entry: cond(p.entry),
    exit: cond(p.exit),
  };
}

/** keccak256(abi.encode(params)) — the contract stores the same value as paramsHash. */
export function paramsHash(p: RuleParams): `0x${string}` {
  return keccak256(encodeAbiParameters([RULE_PARAMS_TUPLE], [paramsStruct(p)]));
}

/** keccak256 of a canonical JSON spec (sorted keys, bigints as strings). Informational: stored as specHash. */
export function specHash(spec: unknown): `0x${string}` {
  const canon = (v: unknown): unknown =>
    typeof v === "bigint"
      ? v.toString()
      : Array.isArray(v)
        ? v.map(canon)
        : v && typeof v === "object"
          ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]))
          : v;
  return keccak256(toHex(JSON.stringify(canon(spec))));
}

export const DECISION_LOG_ABI = [
  { type: "function", name: "register", stateMutability: "nonpayable", inputs: [RULE_PARAMS_TUPLE, { name: "specHash", type: "bytes32" }], outputs: [{ name: "id", type: "uint256" }] },
  { type: "function", name: "retire", stateMutability: "nonpayable", inputs: [{ name: "id", type: "uint256" }], outputs: [] },
  {
    type: "function",
    name: "commit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "barEnd", type: "uint64" },
      { name: "roundIds", type: "uint80[]" },
      { name: "action", type: "uint8" },
      { name: "reason", type: "uint8" },
    ],
    outputs: [{ name: "seq", type: "uint256" }],
  },
  {
    type: "function",
    name: "check",
    stateMutability: "view",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "barEnd", type: "uint64" },
      { name: "roundIds", type: "uint80[]" },
    ],
    outputs: [
      { name: "action", type: "uint8" },
      { name: "reason", type: "uint8" },
      { name: "price", type: "int256" },
      { name: "closeAge", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "proveClose",
    stateMutability: "view",
    inputs: [
      { name: "feed", type: "address" },
      { name: "barEnd", type: "uint64" },
      { name: "roundId", type: "uint80" },
    ],
    outputs: [
      { name: "answer", type: "int256" },
      { name: "updatedAt", type: "uint256" },
    ],
  },
  { type: "function", name: "ruleSetCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "ruleSetsOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256[]" }] },
  { type: "function", name: "decisionCount", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "SETTLE", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "ruleSet",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        name: "info",
        type: "tuple",
        components: [
          { name: "owner", type: "address" },
          { name: "registeredAt", type: "uint64" },
          { name: "retired", type: "bool" },
          { name: "specHash", type: "bytes32" },
          { name: "paramsHash", type: "bytes32" },
        ],
      },
      RULE_PARAMS_TUPLE,
      {
        name: "state",
        type: "tuple",
        components: [
          { name: "cash", type: "uint128" },
          { name: "units", type: "uint128" },
          { name: "feesPaid", type: "uint128" },
          { name: "entryPrice", type: "int64" },
          { name: "lastBar", type: "uint64" },
          { name: "entryDay", type: "uint32" },
          { name: "entriesToday", type: "uint8" },
          { name: "inPosition", type: "bool" },
          { name: "decisions", type: "uint32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "decisions",
    stateMutability: "view",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "from", type: "uint256" },
      { name: "count", type: "uint256" },
    ],
    outputs: [
      {
        name: "out",
        type: "tuple[]",
        components: [
          { name: "barEnd", type: "uint64" },
          { name: "roundId", type: "uint80" },
          { name: "price", type: "int64" },
          { name: "action", type: "uint8" },
          { name: "reason", type: "uint8" },
          { name: "gapBars", type: "uint32" },
          { name: "l2Block", type: "uint64" },
          { name: "cashAfter", type: "uint128" },
          { name: "unitsAfter", type: "uint128" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "RuleSetRegistered",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "feed", type: "address", indexed: true },
      { name: "interval", type: "uint32", indexed: false },
      { name: "paramsHash", type: "bytes32", indexed: false },
      { name: "specHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "DecisionCommitted",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "seq", type: "uint256", indexed: true },
      { name: "barEnd", type: "uint64", indexed: false },
      { name: "roundId", type: "uint80", indexed: false },
      { name: "price", type: "int64", indexed: false },
      { name: "action", type: "uint8", indexed: false },
      { name: "reason", type: "uint8", indexed: false },
      { name: "gapBars", type: "uint32", indexed: false },
      { name: "cashAfter", type: "uint128", indexed: false },
      { name: "unitsAfter", type: "uint128", indexed: false },
    ],
  },
  { type: "error", name: "NotOwner", inputs: [] },
  { type: "error", name: "UnknownRuleSet", inputs: [] },
  { type: "error", name: "Retired", inputs: [] },
  { type: "error", name: "FeedNotUsable", inputs: [] },
  { type: "error", name: "BarNotAligned", inputs: [] },
  { type: "error", name: "BarNotSettled", inputs: [] },
  { type: "error", name: "BarBeforeRegistration", inputs: [] },
  { type: "error", name: "BarNotAfterLast", inputs: [] },
  { type: "error", name: "WrongRoundCount", inputs: [{ name: "expected", type: "uint256" }] },
  { type: "error", name: "RoundNotClose", inputs: [{ name: "index", type: "uint256" }] },
  { type: "error", name: "RoundsNotOrdered", inputs: [{ name: "index", type: "uint256" }] },
  { type: "error", name: "BadAnswer", inputs: [{ name: "index", type: "uint256" }] },
  {
    type: "error",
    name: "DecisionMismatch",
    inputs: [
      { name: "expectedAction", type: "uint8" },
      { name: "expectedReason", type: "uint8" },
    ],
  },
  { type: "error", name: "BadCondition", inputs: [{ name: "which", type: "uint8" }] },
  { type: "error", name: "BadParams", inputs: [{ name: "code", type: "uint8" }] },
] as const;

export const FEED_ABI = [
  {
    type: "function",
    name: "getRoundData",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint80" }],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;
