import { isAddress } from "@/config/brand";

/*
 * Rutiq's own contract on Robinhood Chain (chain 4663), deployed 23 Nov 2026 and verified on the explorer. Re-check the deployment with
 *   npm run verify-deployment -- --log <address> --log-tx <tx>
 *   decisionLog  RutiqDecisionLog (+ internal library RutiqRuleMath, inlined, nothing to link): rule sets owned by a wallet, paper
 *                decisions committed per bar and re-checked on chain against the referenced Chainlink rounds; paper account on chain.
 *                No funds, no tokens, no orders, no owner, no fee, no upgrade.
 */
const DEPLOYED = {
  decisionLog: "0x358b68b486b52a062da5a3deb8a568109a905307",
  /** Block of the deployment transaction. */
  block: 121273701,
  /** Creation transaction. */
  tx: "0x73142f00ccbaec8aba6c860df41010cf1a9cf685c03f3542234b7824f7dac8e9",
};

/**
 * Local tests only: NEXT_PUBLIC_RUTIQ_TEST_CONTRACTS='{"decisionLog":"0x…","block":1}' at build time points a second build at a
 * contract on an anvil chain. Never set it on Vercel.
 */
function testOverride(): typeof DEPLOYED | null {
  const raw = process.env.NEXT_PUBLIC_RUTIQ_TEST_CONTRACTS;
  if (!raw) return null;
  try {
    const v = { ...DEPLOYED, ...(JSON.parse(raw) as Partial<typeof DEPLOYED>) };
    return isAddress(v.decisionLog) ? v : null;
  } catch {
    return null;
  }
}

export const CONTRACTS = testOverride() ?? DEPLOYED;
export const logLive = () => isAddress(CONTRACTS.decisionLog);
export const CONTRACT_NAME = "RutiqDecisionLog" as const;
