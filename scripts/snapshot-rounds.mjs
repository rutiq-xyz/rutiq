// Reads the full Chainlink round history of every market in src/config/markets.generated.ts from Robinhood Chain and writes
// src/data/rounds/<ID>.json. The snapshot only saves the server from re-reading thousands of immutable rounds on every cold start:
// every round in it can be re-read by anyone with getRoundData(roundId) on the feed, and the site's "verify" buttons do exactly that.
// Rounds newer than the snapshot are read live by src/lib/server/rounds.ts.
// Run: RPC_URL=<robinhood rpc> node scripts/snapshot-rounds.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const RPC = process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const src = readFileSync(new URL("../src/config/markets.generated.ts", import.meta.url), "utf8");
const markets = JSON.parse(src.slice(src.indexOf("export const MARKETS: Market[] = ") + 33).replace(/;\s*$/, ""));

let id = 0;
async function batch(calls) {
  const out = [];
  for (let i = 0; i < calls.length; i += 40) {
    const chunk = calls.slice(i, i + 40);
    for (let t = 0; ; t++) {
      try {
        const r = await fetch(RPC, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(chunk.map(([to, data]) => ({ jsonrpc: "2.0", id: ++id, method: "eth_call", params: [{ to, data }, "latest"] }))),
        });
        const j = await r.json();
        if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 200));
        j.sort((a, b) => a.id - b.id);
        out.push(...j);
        break;
      } catch (e) {
        if (t === 5) throw e;
        await new Promise((r) => setTimeout(r, 800 * (t + 1)));
      }
    }
  }
  return out;
}
const pad = (n) => n.toString(16).padStart(64, "0");
const word = (hex, i) => BigInt("0x" + hex.slice(2 + 64 * i, 2 + 64 * (i + 1)));
const signed = (v) => (v >= 1n << 255n ? v - (1n << 256n) : v);

const blockRes = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }) }).then((r) => r.json());
const block = Number(BigInt(blockRes.result));
mkdirSync(new URL("../src/data/rounds/", import.meta.url), { recursive: true });
for (const m of markets) {
  const [latest] = await batch([[m.feed, "0xfeaf968c"]]);
  const rid = word(latest.result, 0);
  const phase = rid >> 64n;
  const last = rid & ((1n << 64n) - 1n);
  const ids = [];
  for (let r = 1n; r <= last; r++) ids.push((phase << 64n) | r);
  const res = await batch(ids.map((x) => [m.feed, "0x9a6fc8f5" + pad(x)]));
  const rows = [];
  let bad = 0;
  res.forEach((x, i) => {
    if (x.error || !x.result || x.result.length < 2 + 64 * 5) {
      bad++;
      return;
    }
    const answer = signed(word(x.result, 1));
    const updatedAt = Number(word(x.result, 3));
    if (updatedAt === 0 || answer <= 0n) {
      bad++;
      return;
    }
    rows.push([Number(ids[i] & ((1n << 64n) - 1n)), answer.toString(), updatedAt]);
  });
  // Rounds must move forward in time; refuse to write a snapshot that does not.
  for (let i = 1; i < rows.length; i++) if (rows[i][2] < rows[i - 1][2]) throw new Error(`${m.id}: round ${rows[i][0]} goes back in time`);
  const file = { market: m.id, feed: m.feed, phase: Number(phase), block, takenAt: Math.floor(Date.now() / 1000), unreadable: bad, rounds: rows };
  writeFileSync(new URL(`../src/data/rounds/${m.id}.json`, import.meta.url), JSON.stringify(file));
  console.log(m.id, "rounds", rows.length, "unreadable", bad, "first", new Date(rows[0][2] * 1000).toISOString(), "last", new Date(rows.at(-1)[2] * 1000).toISOString());
}
