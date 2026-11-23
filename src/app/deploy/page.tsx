import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { DeployPanel } from "@/components/deploy/DeployPanel";
import { PageHead } from "@/components/site/PageHead";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deploy", robots: { index: false, follow: false } };

// Owner tool, local only: on any public host this route is a 404.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export default async function DeployPage() {
  const host = (await headers()).get("host") ?? "";
  if (!LOCAL_HOST.test(host)) notFound();
  return (
    <>
      <PageHead eyebrow="Owner tool · localhost only" title="Deploy the decision log.">
        <p>This page exists only on localhost. It deploys RutiqDecisionLog from the connected wallet, then tells you what to paste into src/config/contracts.ts.</p>
      </PageHead>
      <div className="wrap pb-10">
        <DeployPanel />
      </div>
    </>
  );
}
