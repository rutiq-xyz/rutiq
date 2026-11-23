import "server-only";
import { MARKETS, type Market } from "@/config/markets.generated";
import AAPL from "@/data/rounds/AAPL.json";
import ETH from "@/data/rounds/ETH.json";
import NVDA from "@/data/rounds/NVDA.json";
import QQQ from "@/data/rounds/QQQ.json";
import SPY from "@/data/rounds/SPY.json";
import TSLA from "@/data/rounds/TSLA.json";
import { pad, rpcBatch, signed, uint, words } from "@/lib/feeds/rpc";

/*
 * Chainlink round history per market. Old rounds never change, so the bundled snapshot (scripts/snapshot-rounds.mjs) is the start;
 * rounds after it are read live from the feed (getRoundData, in batches) and appended. Every round can be re-read by anyone on chain,
 * which is what makes a backtest on this data checkable. A top-up that fails is not cached: the last complete history is served with
 * its read time and `complete: false`.
 */

type SnapshotFile = { market: string; feed: string; phase: number; block: number; takenAt: number; unreadable: number; rounds: [number, string, number][] };
const FILES: Record<string, SnapshotFile> = { ETH, NVDA, TSLA, AAPL, SPY, QQQ } as unknown as Record<string, SnapshotFile>;

/** [aggregatorRound, answer (decimal string), updatedAt] — compact on the wire. */
export type RoundRow = [number, string, number];

export type History = {
  market: string;
  feed: string;
  phase: number;
  rounds: RoundRow[];
  /** rounds up to here came from the bundled snapshot (taken at this chain block / time) */
  snapshotBlock: number;
  snapshotTakenAt: number;
  snapshotCount: number;
  /** the latest round the server saw on chain, and when it read it (ms) */
  latestRound: number | null;
  readAt: number;
  complete: boolean;
  problem?: string;
};

const LATEST = "0xfeaf968c";
const GET_ROUND = "0x9a6fc8f5";
const MAX_LIVE = 600; // rounds read live per refresh; more than that and the snapshot should be re-taken
const TTL = 60_000;

const live = new Map<string, { at: number; rows: RoundRow[]; latest: number; complete: boolean; problem?: string }>();
const flying = new Map<string, Promise<void>>();

export const marketById = (id: string): Market | undefined => MARKETS.find((m) => m.id === id);

async function topUp(m: Market, file: SnapshotFile) {
  const last = file.rounds.length ? file.rounds[file.rounds.length - 1][0] : 0;
  const [head] = await rpcBatch<string>([{ method: "eth_call", params: [{ to: m.feed, data: LATEST }, "latest"] }]);
  if (typeof head !== "string" || head.length < 2 + 64 * 5) throw new Error("latestRoundData unreadable");
  const w = words(head);
  const rid = uint(w[0]);
  const phase = Number(rid >> 64n);
  const latest = Number(rid & ((1n << 64n) - 1n));
  if (phase !== file.phase) throw new Error(`feed moved to phase ${phase}; re-take the snapshot`);
  const from = last + 1;
  const to = Math.min(latest, last + MAX_LIVE);
  const rows: RoundRow[] = [];
  for (let start = from; start <= to; start += 40) {
    const ids: bigint[] = [];
    for (let r = start; r <= Math.min(to, start + 39); r++) ids.push((BigInt(phase) << 64n) | BigInt(r));
    const res = await rpcBatch<string>(ids.map((id) => ({ method: "eth_call", params: [{ to: m.feed, data: GET_ROUND + pad(id) }, "latest"] })));
    res.forEach((x, i) => {
      if (typeof x !== "string" || x.length < 2 + 64 * 5) throw new Error(`round ${ids[i] & ((1n << 64n) - 1n)} unreadable`);
      const ww = words(x);
      const answer = signed(ww[1]);
      const updatedAt = Number(uint(ww[3]));
      if (answer <= 0n || updatedAt === 0) throw new Error("round with no answer");
      rows.push([Number(ids[i] & ((1n << 64n) - 1n)), answer.toString(), updatedAt]);
    });
  }
  const complete = to === latest;
  live.set(m.id, { at: Date.now(), rows, latest, complete, problem: complete ? undefined : `only ${MAX_LIVE} newer rounds read; snapshot needs a refresh` });
}

export async function history(id: string): Promise<History | null> {
  const m = marketById(id);
  const file = FILES[id];
  if (!m || !file) return null;
  const hit = live.get(id);
  let problem: string | undefined;
  if (!hit || Date.now() - hit.at > TTL) {
    let p = flying.get(id);
    if (!p) {
      p = topUp(m, file).finally(() => flying.delete(id));
      flying.set(id, p);
    }
    await p.catch((e: unknown) => {
      problem = e instanceof Error ? e.message.slice(0, 160) : "chain read failed";
    });
  }
  const got = live.get(id);
  // Live rows are only used when they continue the snapshot exactly.
  const base = file.rounds;
  const tail = got && got.rows.length && got.rows[0][0] === (base.length ? base[base.length - 1][0] + 1 : 1) ? got.rows : [];
  return {
    market: id,
    feed: m.feed,
    phase: file.phase,
    rounds: tail.length ? base.concat(tail) : base,
    snapshotBlock: file.block,
    snapshotTakenAt: file.takenAt,
    snapshotCount: base.length,
    latestRound: got?.latest ?? null,
    readAt: got?.at ?? file.takenAt * 1000,
    complete: Boolean(got?.complete) && !problem,
    problem: problem ?? got?.problem,
  };
}

/** Latest round of every market in one batch (prices for the ticker, paper trading and the data page). */
export type Latest = { id: string; roundId: string; answer: string; updatedAt: number } | { id: string; error: string };

let latestCache: { at: number; rows: Latest[] } | null = null;
let latestFlying: Promise<Latest[]> | null = null;

export async function latestAll(): Promise<{ rows: Latest[]; readAt: number }> {
  if (latestCache && Date.now() - latestCache.at < 15_000) return { rows: latestCache.rows, readAt: latestCache.at };
  latestFlying ??= rpcBatch<string>(MARKETS.map((m) => ({ method: "eth_call", params: [{ to: m.feed, data: LATEST }, "latest"] })))
    .then((res) =>
      res.map((x, i): Latest => {
        const id = MARKETS[i].id;
        if (typeof x !== "string" || x.length < 2 + 64 * 5) return { id, error: "unreadable" };
        const w = words(x);
        return { id, roundId: uint(w[0]).toString(), answer: signed(w[1]).toString(), updatedAt: Number(uint(w[3])) };
      }),
    )
    .finally(() => {
      latestFlying = null;
    });
  const rows = await latestFlying;
  // Cache only a read where every market answered.
  if (rows.every((r) => !("error" in r))) latestCache = { at: Date.now(), rows };
  else if (latestCache) return { rows: latestCache.rows, readAt: latestCache.at };
  return { rows, readAt: Date.now() };
}
