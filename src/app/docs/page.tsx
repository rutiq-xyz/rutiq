import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { PageHead, StatusBadge } from "@/components/site/PageHead";
import { BRAND, CHAIN } from "@/config/brand";
import { FAQ } from "@/lib/faq";
import { faqLd, pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  path: "/docs",
  title: `How ${BRAND.name} works: rules, proven prices, paper decisions | ${BRAND.name}`,
  description: "How a rule decides, how a bar close is proven from Chainlink rounds, the fill and cost model, what the on-chain log proves and does not, the risks, and what is planned.",
});

const CONDS = [
  ["Short average crosses above / below long", "The short simple moving average of closes moves from at-or-below to above the long one on this bar (or the reverse).", "long + 1 closes"],
  ["Close above / below its average", "This bar's close against the simple moving average of the last N closes, this one included.", "N closes"],
  ["Change over N bars ≥ / ≤ x %", "(close − close N bars ago) ÷ close N bars ago, in basis points, against your threshold.", "N + 1 closes"],
  ["Close above / below a price", "This bar's close against a fixed price in the feed's units (USD, 8 decimals).", "1 close"],
];

const GLOSS = [
  ["Backtest", "Running a rule over past bars to see what it would have done. A replay, never a forecast."],
  ["Paper trading", "Running a rule forward on live prices with virtual cash. Nothing is bought or sold."],
  ["Chainlink round", "One published price of a feed: round id, answer and the time it was published, readable on chain forever."],
  ["Bar close", "The price at the end of a bar: the latest round published at or before that moment."],
  ["Moving average", "The plain average of the last N bar closes."],
  ["Stop-loss / take-profit", "Sell when the close falls / rises a set percent from the entry price. Checked at bar closes only."],
  ["Drawdown", "The largest fall of equity from a previous high, in percent."],
  ["Buy and hold", "Buying at the first bar of the window with all the cash (same fee) and keeping it to the end."],
  ["Decision log", "The list of what the rule decided and why, bar by bar; on chain when committed to RutiqDecisionLog."],
];

export default function DocsPage() {
  return (
    <>
      <JsonLd data={faqLd(FAQ)} />
      <PageHead eyebrow="Docs" title="Rules you can read. Prices you can prove.">
        <p>{BRAND.name} is a paper-only studio for rule-based trading agents on {CHAIN.name}. This page explains exactly how a rule decides and what can be checked.</p>
      </PageHead>
      <div className="wrap grid gap-6 py-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="small hidden self-start lg:sticky lg:top-28 lg:grid lg:gap-2" aria-label="On this page">
          <a href="#how">How it works</a>
          <a href="#conditions">Conditions</a>
          <a href="#check">How a decision is checked</a>
          <a href="#costs">Fills and costs</a>
          <a href="#risks">Risks and limits</a>
          <a href="#planned">Planned</a>
          <a href="#glossary">Glossary</a>
        </nav>
        <div className="grid min-w-0 gap-6">
          <section className="panel" id="how">
            <div className="panel-h">
              <h2 className="h3 text-[20px]">How it works</h2>
              <StatusBadge status="Prototype" />
            </div>
            <ol className="panel-b copy grid list-decimal gap-3 pl-9">
              <li>Pick a market (a Chainlink feed on {CHAIN.name}) and a bar length: 1 hour, 4 hours or 1 day.</li>
              <li>Write the entry and the exit: up to one condition each, plus stop-loss, take-profit, size per entry, a daily entry limit, a schedule of UTC hours and weekdays, and how old a price may be before the agent ignores it.</li>
              <li>
                Backtest it in the <Link href="/studio">studio</Link> on the feed&apos;s full round history: every bar is decided with the same integer math the contract uses.
              </li>
              <li>
                Run it on <Link href="/paper">paper</Link>: from the next bar close on, the agent decides on live rounds and writes why it acted or waited.
              </li>
              <li>
                Optionally commit its decisions to the <Link href="/log">on-chain log</Link>, which re-checks each one before writing it.
              </li>
            </ol>
          </section>
          <section className="panel" id="conditions">
            <div className="panel-h">
              <h2 className="h3 text-[20px]">Conditions</h2>
            </div>
            <div className="panel-b">
              <div className="overflow-hidden rounded-xl border border-line">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="w-[32%]">Condition</th>
                      <th>What is compared</th>
                      <th className="w-[22%]">Closes used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CONDS.map(([a, b, c]) => (
                      <tr key={a}>
                        <td className="text-white">{a}</td>
                        <td className="text-white/70">{b}</td>
                        <td className="text-white/70">{c}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small mt-3">
                Order at each bar: outside the schedule or price too old → wait. In a position: stop-loss, then take-profit, then the exit rule. Flat: the daily entry limit, then the entry rule. One
                position at a time, long only. Exits are never blocked by the daily limit. Look-backs are capped at 48 bars.
              </p>
            </div>
          </section>
          <section className="panel" id="check">
            <div className="panel-h">
              <h2 className="h3 text-[20px]">How a decision is checked</h2>
            </div>
            <div className="panel-b copy grid gap-3">
              <p>
                A bar&apos;s close is proven by two reads of the feed: round r was published at or before the bar end, and round r + 1 was published after it (or r is still the latest round). The site
                shows the round of every close and a “Re-read on chain” button that runs exactly this test from your browser.
              </p>
              <p>
                A commit to RutiqDecisionLog carries the rule set number, the bar end and the round ids of every close the rule needs. The contract proves each close, recomputes the conditions,
                the stop, the take-profit, the schedule, the stale-price limit and the daily limit from its own record of the paper account, and accepts the commit only if the action and the
                reason match. It then updates the paper cash and units on chain.
              </p>
              <p className="note">
                What it does not prove: that every bar was committed (skipped bars are counted on chain and shown), that the rule is any good, or that a real trade could have filled at that price.
                Bars that closed before the rule was registered cannot be committed, so a backtest cannot be passed off as a live record.
              </p>
            </div>
          </section>
          <section className="panel" id="costs">
            <div className="panel-h">
              <h2 className="h3 text-[20px]">Fills and costs</h2>
            </div>
            <div className="panel-b copy grid gap-3">
              <p>Fills happen at the proven close of the decision bar. One setting, “fee + slippage”, is charged on every buy and every sell. A buy spends your size percent of the paper cash; a sell closes the whole position.</p>
              <p>Cash is counted in millionths of a dollar and units in 18 decimals; divisions round down, on the site and in the contract alike, so both arrive at the same numbers (checked on 991 test bars).</p>
              <p className="small">The real world is harsher: a market order would fill after the close, spreads widen outside the US session, and depth is limited. Set the fee higher than you think.</p>
            </div>
          </section>
          <section className="panel" id="risks">
            <div className="panel-h">
              <h2 className="h3 text-[20px]">Risks and limits</h2>
            </div>
            <div className="panel-b faq">
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>
                    {f.q} <span className="pm">+</span>
                  </summary>
                  <p className="a">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
          <section className="panel" id="planned">
            <div className="panel-h">
              <h2 className="h3 text-[20px]">Planned, not built</h2>
              <StatusBadge status="Concept" />
            </div>
            <ul className="panel-b copy grid list-disc gap-2 pl-9">
              <li>Trading with real funds, as a later stage, only after the paper stage has proven itself and an independent review of whatever holds funds.</li>
              <li>{BRAND.symbol} as compute credits for longer backtests and more simultaneous paper agents, once those services exist.</li>
              <li>More markets and condition types (RSI, ranges, combined conditions).</li>
            </ul>
          </section>
          <section className="panel" id="glossary">
            <div className="panel-h">
              <h2 className="h3 text-[20px]">Glossary</h2>
            </div>
            <dl className="panel-b grid gap-3 sm:grid-cols-2">
              {GLOSS.map(([t, d]) => (
                <div key={t}>
                  <dt className="font-serif font-semibold">{t}</dt>
                  <dd className="small mt-1">{d}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
