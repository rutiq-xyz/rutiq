// Starting points for the rule builder. Every value is editable; nothing here is a recommendation.
import { ALL_DAYS, ALL_HOURS, KIND, WEEKDAYS, type Condition, type RuleParams } from "./rules";

export type Preset = { id: string; name: string; note: string; build: (feed: `0x${string}`, lastPrice: bigint) => RuleParams };

const none: Condition = { kind: KIND.NONE, a: 0, b: 0, value: 0n };
const base = {
  // just over the feeds' 24 h heartbeat: a quiet crypto feed still counts, a closed stock market over a weekend does not
  maxStale: 25 * 3600,
  sizeBps: 10_000,
  feeBps: 20,
  stopBps: 0,
  takeProfitBps: 0,
  maxEntriesPerDay: 2,
  hoursMask: ALL_HOURS,
  daysMask: ALL_DAYS,
  startCash: 10_000n * 1_000_000n,
};

/** US cash session closes, 14:00..20:00 UTC (stock feeds are liveliest then). */
const US_HOURS = 0b0000_0001_1111_1100_0000_0000_0000 & 0xffffff;

export const PRESETS: Preset[] = [
  {
    id: "cross",
    name: "Average cross",
    note: "Enters when a short average crosses above a long one; leaves on the opposite cross or a 4 % stop.",
    build: (feed) => ({ ...base, feed, interval: 3600, entry: { kind: KIND.SMA_CROSS_UP, a: 6, b: 24, value: 0n }, exit: { kind: KIND.SMA_CROSS_DOWN, a: 6, b: 24, value: 0n }, stopBps: 400 }),
  },
  {
    id: "dip",
    name: "Buy the dip",
    note: "Enters after a 3 % drop over 6 bars; leaves when the close is back above its 12-bar average, at +5 % or at a 6 % stop.",
    build: (feed) => ({ ...base, feed, interval: 3600, entry: { kind: KIND.CHANGE_AT_MOST, a: 6, b: 0, value: -300n }, exit: { kind: KIND.ABOVE_SMA, a: 12, b: 0, value: 0n }, takeProfitBps: 500, stopBps: 600 }),
  },
  {
    id: "breakout",
    name: "Momentum",
    note: "Enters after a 2 % rise over 4 bars; leaves when the close drops below its 8-bar average or at a 3 % stop.",
    build: (feed) => ({ ...base, feed, interval: 3600, entry: { kind: KIND.CHANGE_AT_LEAST, a: 4, b: 0, value: 200n }, exit: { kind: KIND.BELOW_SMA, a: 8, b: 0, value: 0n }, stopBps: 300 }),
  },
  {
    id: "levels",
    name: "Price levels",
    note: "Buys below one price, sells above another. Levels start 3 % around the latest close.",
    build: (feed, last) => ({
      ...base,
      feed,
      interval: 3600,
      entry: { kind: KIND.PRICE_BELOW, a: 0, b: 0, value: (last * 97n) / 100n },
      exit: { kind: KIND.PRICE_ABOVE, a: 0, b: 0, value: (last * 103n) / 100n },
      stopBps: 800,
    }),
  },
  {
    id: "session",
    name: "Weekday session",
    note: "Only acts on hourly closes 14:00–20:00 UTC, Monday to Friday: above the 10-bar average in, below it out.",
    build: (feed) => ({ ...base, feed, interval: 3600, hoursMask: US_HOURS, daysMask: WEEKDAYS, entry: { kind: KIND.ABOVE_SMA, a: 10, b: 0, value: 0n }, exit: { kind: KIND.BELOW_SMA, a: 10, b: 0, value: 0n }, stopBps: 300 }),
  },
];

export const NONE_CONDITION = none;
