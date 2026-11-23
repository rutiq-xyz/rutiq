// Checks behind scripts/verify-deployment.mjs, free of I/O so they can be tested with a fake chain.
//
// How it decides that an address runs this repository's RutiqDecisionLog:
//   - Runtime code is compared byte for byte with src/lib/contracts/artifacts.json (`npm run contracts:artifacts -- --check`
//     proves that file is a fresh forge build). The decision log has no immutables and no constructor arguments.
//   - The creation transaction is required (no tx => FAIL, never MATCH). It must have succeeded, created exactly the address
//     checked, have no recipient, and carry exactly this build's creation code.
// Every check fails closed: an RPC error, an empty or malformed answer is a FAIL, never a skip.

export const CHAIN_ID = 4663;
export const NAME = "RutiqDecisionLog";

const isAddr = (v) => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
const isHex = (v) => typeof v === "string" && /^0x([0-9a-fA-F]{2})*$/.test(v);
const isTx = (v) => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/** True when `code` is this build's runtime for `name` (no immutables are expected). */
export function match(ART, name, code) {
  const a = ART[name];
  if (!a || a.immutables.length) return false;
  return String(code).toLowerCase().replace(/^0x/, "") === a.runtime.slice(2);
}

/** input: { decisionLog, logTx, rpc, ART }. Returns { ok, lines }. */
export async function verifyDeployment({ decisionLog, logTx, rpc, ART }) {
  const lines = [];
  let failed = false;
  const ok = (m) => lines.push(`OK   ${m}`);
  const fail = (m) => {
    failed = true;
    lines.push(`FAIL ${m}`);
  };
  const done = () => ({ ok: !failed, lines });

  try {
    const id = await rpc("eth_chainId", []);
    if (Number(BigInt(id)) !== CHAIN_ID) {
      fail(`chain id ${id}, expected ${CHAIN_ID}`);
      return done();
    }
    ok(`chain id ${CHAIN_ID} (Robinhood Chain)`);
  } catch (e) {
    fail(`chain id unreadable: ${e.message}`);
    return done();
  }
  if (!isAddr(decisionLog)) {
    fail("give --log <address>");
    return done();
  }
  try {
    const c = await rpc("eth_getCode", [decisionLog, "latest"]);
    if (!isHex(c) || c.length <= 2) throw new Error(`no code at ${decisionLog}`);
    if (match(ART, NAME, c)) ok(`${NAME} at ${decisionLog}: runtime matches this build`);
    else fail(`${NAME} at ${decisionLog}: runtime differs from this build`);
  } catch (e) {
    fail(`${NAME}: ${e.message}`);
  }
  if (!isTx(logTx)) {
    fail(`${NAME}: no valid creation tx given; runtime alone is not a full match`);
    return done();
  }
  try {
    const [t, rc] = await Promise.all([rpc("eth_getTransactionByHash", [logTx]), rpc("eth_getTransactionReceipt", [logTx])]);
    if (!t || !rc) fail(`${NAME}: creation tx ${logTx} not found`);
    else if (rc.status !== "0x1") fail(`${NAME}: creation tx failed`);
    else if (!same(rc.contractAddress, decisionLog)) fail(`${NAME}: tx created ${rc.contractAddress}, not ${decisionLog}`);
    else if (t.to) fail(`${NAME}: tx has a recipient, not a deployment`);
    else if (String(t.input).toLowerCase() === ART[NAME].creation.toLowerCase()) ok(`${NAME}: creation input is exactly this build's creation code`);
    else fail(`${NAME}: creation input differs from this build`);
  } catch (e) {
    fail(`${NAME}: creation tx unreadable: ${e.message}`);
  }
  return done();
}
