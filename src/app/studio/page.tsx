import { Studio } from "@/components/app/Studio";
import { PageHead } from "@/components/site/PageHead";
import { BRAND } from "@/config/brand";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/studio",
  title: `Rule studio: write and backtest a trading rule | ${BRAND.name}`,
  description: "Write entry and exit rules on price, moving averages, % change and a schedule, then backtest them over Chainlink price rounds you can re-read on Robinhood Chain. Equity, fees, drawdown and buy-and-hold, every decision with its reason.",
});

export default function StudioPage() {
  return (
    <>
      <PageHead eyebrow="Rule studio" title="Write the rule. Test it on prices the chain can prove.">
        <p>
          Every close in a backtest is a Chainlink round on Robinhood Chain, with its round number, so any bar can be re-read on chain. Results show fees, drawdown and buy-and-hold next to the
          rule. A simulation, not a promise: past prices never guarantee profit.
        </p>
      </PageHead>
      <Studio />
    </>
  );
}
