// Bar closes from Chainlink rounds. The close of the bar ending at T is the answer of the LATEST round with updatedAt <= T: the price
// the feed was publishing at that moment. The contract proves the same thing with two getRoundData reads (round and round + 1).

export type Round = {
  /** Full proxy round id: (phase << 64) | aggregatorRound. */
  id: bigint;
  answer: bigint;
  updatedAt: number;
};

/** Index of the latest round with updatedAt <= t in rounds sorted by id (and so by time), or -1. */
export function roundIndexAt(rounds: Round[], t: number): number {
  let lo = 0;
  let hi = rounds.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rounds[mid].updatedAt <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

export type BarClose = { barEnd: number; round: Round; age: number };

/** Closes for bars ending at barEnd, barEnd - interval, ... (count of them), newest first; null when history does not reach. */
export function closesAt(rounds: Round[], barEnd: number, interval: number, count: number): BarClose[] | null {
  const out: BarClose[] = [];
  for (let i = 0; i < count; i++) {
    const t = barEnd - i * interval;
    const k = roundIndexAt(rounds, t);
    if (k < 0) return null;
    out.push({ barEnd: t, round: rounds[k], age: t - rounds[k].updatedAt });
  }
  return out;
}

export const alignDown = (t: number, interval: number) => Math.floor(t / interval) * interval;

/** Checks the rounds are strictly increasing in id and non-decreasing in time, which the binary search relies on. */
export function sortedRounds(rounds: Round[]): Round[] {
  const r = [...rounds].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (let i = 1; i < r.length; i++) {
    if (r[i].id === r[i - 1].id) throw new Error(`round ${r[i].id} appears twice`);
    if (r[i].updatedAt < r[i - 1].updatedAt) throw new Error(`round ${r[i].id} goes back in time`);
  }
  return r;
}

export const phaseOf = (id: bigint) => Number(id >> 64n);
export const aggRoundOf = (id: bigint) => id & ((1n << 64n) - 1n);
