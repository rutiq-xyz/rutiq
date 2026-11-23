import { DataView } from "@/components/app/DataView";
import { PageHead } from "@/components/site/PageHead";
import { BRAND } from "@/config/brand";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/data",
  title: `Price data: Chainlink rounds on Robinhood Chain | ${BRAND.name}`,
  description: "The markets Rutiq tests on, their Chainlink feeds and proven tokens on Robinhood Chain, the latest round of each, and a tool to re-read any bar close on chain yourself.",
});

export default function DataPage() {
  return (
    <>
      <PageHead eyebrow="Price data" title="Where every price comes from.">
        <p>Six markets, each a Chainlink feed on Robinhood Chain. Rounds are public and permanent, so a backtest built on them can be checked number by number.</p>
      </PageHead>
      <DataView />
    </>
  );
}
