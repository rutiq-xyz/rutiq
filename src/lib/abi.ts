import type { Abi } from "viem";

/* Token and feed reads used outside the engine. The decision log's ABI lives in src/lib/engine/abi.ts. */

export const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const satisfies Abi;

export { FEED_ABI, DECISION_LOG_ABI } from "@/lib/engine/abi";
