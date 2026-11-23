import { LogView } from "@/components/app/LogView";
import { PageHead } from "@/components/site/PageHead";
import { BRAND } from "@/config/brand";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/log",
  title: `On-chain decision log | ${BRAND.name}`,
  description: "RutiqDecisionLog: register a rule on Robinhood Chain and commit its paper decisions. The contract re-reads the Chainlink rounds and refuses any decision the rule would not make. No funds.",
});

export default function LogPage() {
  return (
    <>
      <PageHead eyebrow="Decision log" title="A log the chain checks before it writes.">
        <p>Commit a paper agent&apos;s decisions to Robinhood Chain. Each one carries the Chainlink rounds it used; the contract proves them and recomputes the rule before it accepts the entry.</p>
      </PageHead>
      <LogView />
    </>
  );
}
