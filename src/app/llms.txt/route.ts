import { BRAND, CHAIN } from "@/config/brand";
import { CONTRACTS, logLive } from "@/config/contracts";
import { MARKETS } from "@/config/markets.generated";

export const dynamic = "force-static";

export function GET() {
  const lines = [
    `# ${BRAND.name}`,
    "",
    `> ${BRAND.slogan} ${BRAND.tagline} A studio for rule-based trading agents on ${CHAIN.name} (chain ${CHAIN.id}): entry/exit rules on price, moving averages, % change and a schedule; backtests over Chainlink round history that anyone can re-read on chain; paper trading on live feed prices with a decision log that says why the agent acted or waited. Paper only: no funds, no orders, no advice. Real-fund execution and ${BRAND.symbol} compute credits are planned, not built. Not affiliated with Robinhood.`,
    "",
    `Studio (rule builder + backtest): ${BRAND.url}/studio`,
    `Paper trading: ${BRAND.url}/paper`,
    `Decision log (contract): ${BRAND.url}/log`,
    `Price data and round checks: ${BRAND.url}/data`,
    `Round history (JSON): ${BRAND.url}/api/history?market=ETH`,
    `Markets: ${MARKETS.map((m) => `${m.id} (feed ${m.feed})`).join(", ")}`,
    `RutiqDecisionLog: ${logLive() ? CONTRACTS.decisionLog : "not deployed yet"}`,
    `How it works: ${BRAND.url}/docs`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
