import { Paper } from "@/components/app/Paper";
import { PageHead } from "@/components/site/PageHead";
import { BRAND } from "@/config/brand";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/paper",
  title: `Paper trading with a decision log | ${BRAND.name}`,
  description: "Run a rule on live Chainlink prices on Robinhood Chain without funds: at every bar close the agent buys, sells or waits, and the log says why, with the price round it used.",
});

export default function PaperPage() {
  return (
    <>
      <PageHead eyebrow="Paper trading" title="Let the agent decide. Read why it acted or waited.">
        <p>An agent starts with virtual cash and decides at every bar close after it starts, on live feed prices. Nothing is traded and nothing leaves your browser; the log is recomputed from chain data, so it can be replayed.</p>
      </PageHead>
      <Paper />
    </>
  );
}
