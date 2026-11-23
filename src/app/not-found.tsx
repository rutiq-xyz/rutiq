import Link from "next/link";
import { PageHead } from "@/components/site/PageHead";

export default function NotFound() {
  return (
    <>
      <PageHead eyebrow="404" title="No rule matched this page.">
        <p>The agent waited: this address does not exist. The studio does.</p>
      </PageHead>
      <div className="wrap flex flex-wrap gap-3 py-16">
        <Link href="/studio" className="btn btn-orange">
          Open the studio
        </Link>
        <Link href="/" className="btn btn-white">
          Home
        </Link>
      </div>
    </>
  );
}
