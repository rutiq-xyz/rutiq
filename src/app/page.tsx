import { JsonLd } from "@/components/JsonLd";
import { Capabilities, Closing, Faq, Features, Flow, Hero, PriceMarquee, Products, StartBuilding, Terminal } from "@/components/home/Home";
import { FAQ } from "@/lib/faq";
import { appLd, faqLd, HOME_DESCRIPTION, HOME_TITLE, pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ path: "/", title: HOME_TITLE, description: HOME_DESCRIPTION });

/* Home in the UI reference's order: hero over a tile field, live marquee, chip marquees, flow diagram, numbered features with a
 * sticky stack, the decision terminal, three products, start-building cloud, FAQ, closing call. */
export default function Home() {
  return (
    <>
      <JsonLd data={appLd} />
      <JsonLd data={faqLd(FAQ)} />
      <Hero />
      <PriceMarquee />
      <Capabilities />
      <Flow />
      <Features />
      <Terminal />
      <Products />
      <StartBuilding />
      <Faq />
      <Closing />
    </>
  );
}
