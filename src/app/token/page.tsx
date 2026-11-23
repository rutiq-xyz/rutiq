import Link from "next/link";
import { CaBox } from "@/components/site/CaCopy";
import { PageHead, StatusBadge } from "@/components/site/PageHead";
import { BRAND, CHAIN, TOKEN } from "@/config/brand";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/token",
  title: `${BRAND.symbol} token | ${BRAND.name}`,
  description: `${BRAND.symbol} on ${BRAND.chainName}: contract address${TOKEN.isLive ? "" : " (published at launch)"}, the planned use as compute credits, and what it is not. Every ${BRAND.name} feature works without it.`,
});

export default function TokenPage() {
  return (
    <>
      <PageHead eyebrow="Token" title={`${BRAND.symbol}. Not needed to test a rule.`}>
        <p>
          {BRAND.tokenName} ({BRAND.symbol}) is planned for {CHAIN.name}. The studio, paper trading and the decision log all work without it. It is a memecoin with a planned use, not a share
          of anything and not a promise of value.
        </p>
      </PageHead>
      <div className="wrap grid grid-cols-1 gap-6 py-10 lg:grid-cols-2">
        <section className="panel" data-testid="token-ca">
          <div className="panel-h">
            <h2 className="h3 text-[20px]">Contract address</h2>
          </div>
          <div className="panel-b">
            <p className="copy">
              {TOKEN.isLive
                ? `The only ${BRAND.symbol} contract on ${CHAIN.name}. Check it here before you trade; copies with the same name exist.`
                : `Not launched yet. The address is published here and on X ${BRAND.xHandle} at launch; any address shared before that is not ours.`}
            </p>
            <CaBox testid="ca-token" className="mt-6 w-full" />
            <p className="small mt-4">
              Network: {CHAIN.name} (chain {CHAIN.id}), gas paid in {CHAIN.nativeSymbol}. {TOKEN.isLive ? "" : "Launchpad: TBA. "}We never send direct messages first.
            </p>
          </div>
        </section>
        <section className="panel" id="status">
          <div className="panel-h">
            <h2 className="h3 text-[20px]">Planned use</h2>
            <StatusBadge status="Concept" />
          </div>
          <div className="panel-b">
            <ul className="copy grid list-disc gap-3 pl-5">
              <li>Compute credits for longer backtests and more simultaneous paper agents, once those services exist.</li>
              <li>Nothing else is defined. Launching the token does not by itself create a use.</li>
              <li>Backtests, paper trading and the decision log stay usable without it.</li>
            </ul>
            <p className="small mt-6">No yield, no revenue share, no price promise. Holding {BRAND.symbol} gives no claim on any fee, contract or result, and simulated results never guarantee profit.</p>
            <Link href="/studio" className="btn btn-orange mt-6">
              Use the studio without it
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
