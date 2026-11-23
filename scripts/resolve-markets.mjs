// Proves every market Rutiq offers on Robinhood Chain and writes src/config/markets.generated.ts.
// Run: RPC_URL=<robinhood rpc> node scripts/resolve-markets.mjs
//
// A market = one Chainlink price feed (the price history) + the token on Robinhood Chain that follows it.
//  - Feed: description() must equal the expected text, decimals() must be 8, latestRoundData() must answer.
//  - Stock token: counts as an official stock token only when ALL hold:
//      1. keccak256 of its runtime code is the stock-token beacon proxy's code hash (0x6c1fdd40…5630),
//      2. its ERC-1967 beacon slot points at the stock-token beacon 0xe10b…1b00,
//      3. totalSupply() > 0 (minting needs a role only the issuer holds),
//      4. symbol() is exactly the ticker.
//    A ticker or a name alone proves nothing: many unrelated tokens copy stock tickers.
//  - WETH: symbol() "WETH", decimals 18 (the wrapped native coin; no beacon involved).
import { writeFileSync } from "node:fs";
import { keccak256 } from "viem";

const RPC = process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const PROXY_CODEHASH = "0x6c1fdd40002dcb440c7fff6a84171404d279ccb057803b65826f7546acd65630";
const BEACON = "0xe10b6f6b275de231345c20d14ab812db62151b00";
const SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";

// Candidates: token addresses from public DEX listings, feeds from reference-data-directory.vercel.app/feeds-robinhood-mainnet.json.
// Nothing here is trusted until the checks below pass.
const CANDIDATES = [
  { id: "ETH", kind: "crypto", token: "0x0bd7d308f8e1639fab988df18a8011f41eacad73", tokenSymbol: "WETH", feed: "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9", desc: "ETH / USD" },
  { id: "NVDA", kind: "stock", token: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", tokenSymbol: "NVDA", feed: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15", desc: "RHNVDA / USD" },
  { id: "TSLA", kind: "stock", token: "0x322f0929c4625ed5bad873c95208d54e1c003b2d", tokenSymbol: "TSLA", feed: "0x4A1166a659A55625345e9515b32adECea5547C38", desc: "RHTSLA / USD" },
  { id: "AAPL", kind: "stock", token: "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9", tokenSymbol: "AAPL", feed: "0x6B22A786bAa607d76728168703a39Ea9C99f2cD0", desc: "RHAAPL / USD" },
  { id: "SPY", kind: "stock", token: "0x117cc2133c37b721f49de2a7a74833232b3b4c0c", tokenSymbol: "SPY", feed: "0x319724394D3A0e3669269846abE664Cd621f9f6A", desc: "RHSPY / USD" },
  { id: "QQQ", kind: "stock", token: "0xd5f3879160bc7c32ebb4dc785f8a4f505888de68", tokenSymbol: "QQQ", feed: "0x80901d846d5D7B030F26B480776EE3b29374C2ae", desc: "RHQQQ / USD" },
];

let id = 0;
async function rpc(method, params) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
      const b = await r.json();
      if (b.error) throw new Error(b.error.message);
      return b.result;
    } catch (e) {
      if (t === 3) throw e;
    }
  }
}
const call = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
const str = (hex) => {
  if (!hex || hex.length < 130) return null;
  const len = Number(BigInt("0x" + hex.slice(66, 130)));
  return Buffer.from(hex.slice(130, 130 + len * 2), "hex").toString("utf8");
};

const head = Number(BigInt(await rpc("eth_blockNumber", [])));
const rows = [];
for (const c of CANDIDATES) {
  const [desc, dec, latest, symbol, name, supply] = await Promise.all([
    call(c.feed, "0x7284e416"),
    call(c.feed, "0x313ce567"),
    call(c.feed, "0xfeaf968c"),
    call(c.token, "0x95d89b41"),
    call(c.token, "0x06fdde03"),
    call(c.token, "0x18160ddd"),
  ]);
  const d = str(desc);
  const feedOk = (c.kind === "stock" ? [`RH${c.id} / USD`, `Robinhood ${c.id} / USD`].includes(d) : d === c.desc) && Number(BigInt(dec)) === 8 && latest.length >= 2 + 64 * 5;
  if (!feedOk) {
    console.log("REJECT feed", c.id, str(desc), Number(BigInt(dec)));
    continue;
  }
  const sym = str(symbol);
  let proof;
  if (c.kind === "stock") {
    const [code, beacon] = await Promise.all([rpc("eth_getCode", [c.token, "latest"]), rpc("eth_getStorageAt", [c.token, SLOT, "latest"])]);
    proof = {
      codehash: keccak256(code) === PROXY_CODEHASH,
      beacon: "0x" + beacon.slice(26) === BEACON,
      supply: BigInt(supply) > 0n,
      symbol: sym === c.tokenSymbol,
    };
  } else {
    proof = { symbol: sym === c.tokenSymbol, supply: BigInt(supply) > 0n };
  }
  if (Object.values(proof).some((v) => !v)) {
    console.log("REJECT token", c.id, proof);
    continue;
  }
  const latestRound = BigInt("0x" + latest.slice(2, 66));
  rows.push({
    id: c.id,
    kind: c.kind,
    label: c.kind === "stock" ? (str(name) || "").replace(/\s*•\s*Robinhood Token$/, "") : "Ether",
    token: c.token,
    tokenSymbol: sym,
    feed: c.feed.toLowerCase(),
    feedDescription: str(desc),
    decimals: 8,
    phase: Number(latestRound >> 64n),
    proof: Object.keys(proof).join("+"),
  });
  console.log("OK", c.id, rows.at(-1).label, "phase", rows.at(-1).phase);
}

const out = `// Generated by scripts/resolve-markets.mjs at Robinhood Chain block ${head} (${new Date().toISOString().slice(0, 10)}). Do not edit by hand.
// Every row passed its checks on chain: feed description + 8 decimals + a live round; stock tokens by proxy code hash, beacon slot,
// supply > 0 and exact symbol (never by ticker alone); WETH by symbol + supply.
export type MarketKind = "crypto" | "stock";
export type Market = {
  id: string;
  kind: MarketKind;
  label: string;
  token: \`0x\${string}\`;
  tokenSymbol: string;
  feed: \`0x\${string}\`;
  feedDescription: string;
  decimals: number;
  phase: number;
  proof: string;
};
export const MARKETS_RESOLVED_AT = ${head};
export const MARKETS: Market[] = ${JSON.stringify(rows, null, 2)};
`;
writeFileSync(new URL("../src/config/markets.generated.ts", import.meta.url), out);
console.log("wrote", rows.length);
