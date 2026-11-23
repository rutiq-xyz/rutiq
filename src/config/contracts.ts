import { isAddress } from "@/config/brand";

/*
 * Rutiq's own contract on Robinhood Chain (chain 4663). NOT deployed yet: the owner deploys it from the local /deploy page, then pastes
 * the address, block and creation tx here (one edit) and checks it with
 *   npm run verify-deployment -- --log <address> --log-tx <tx>
 *   decisionLog  RutiqDecisionLog (+ internal library RutiqRuleMath, inlined, nothing to link): rule sets owned by a wallet, paper
 *                decisions committed per bar and re-checked on chain against the referenced Chainlink rounds; paper account on chain.
 *                No funds, no tokens, no orders, no owner, no fee, no upgrade.
 */
const DEPLOYED = {
  decisionLog: "TBA",
  /** Block of the deployment transaction. */
  block: 0,
  /** Creation transaction. */
  tx: "",
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
