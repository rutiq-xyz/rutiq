import Link from "next/link";
import { BRAND, CHAIN } from "@/config/brand";
import { MARKETS } from "@/config/markets.generated";
import { Arrow } from "@/components/app/Studio";
import { DecisionTerminal, FeatureStack, PriceMarquee } from "@/components/home/HomeLive";
import { ArrowUpRight } from "@/components/site/Icons";
import { StatusBadge } from "@/components/site/PageHead";
import { Reveal } from "@/components/site/Reveal";
import { FAQ } from "@/lib/faq";

/* Home in the UI reference's order (referensi/recon-ui/NOTES.txt), with Rutiq's own text, art and live data. */

function Buttons({ note = "No wallet, no funds, no token needed" }: { note?: string }) {
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/studio" className="btn btn-orange">
          Open the studio <Arrow />
        </Link>
        <Link href="/docs" className="btn btn-white">
          Read the docs <Arrow />
        </Link>
      </div>
      <p className="btn-pair-note">{note}</p>
    </div>
  );
}

const TILE_ICONS = [
  "M4 17l5-5 4 3 7-8",
  "M5 19V9M10 19V5M15 19v-7M20 19v-11",
  "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  "M6 4h12v16l-3-2-3 2-3-2-3 2zM9 9h6M9 13h6",
  "M8 8l-4 4 4 4M16 8l4 4-4 4",
  "M12 3l8 4v6c0 4-3.5 7-8 8-4.5-1-8-4-8-8V7z",
  "M4 12h4l3-7 4 14 3-7h2",
  "M7 4v16M17 4v16M4 9h6M14 15h6",
];

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-h">
      <div className="field" aria-hidden="true" data-pointer="">
        <div className="plane">
          <div className="drift">
            <div className="grid">
              {Array.from({ length: 54 }, (_, i) => (
                <div key={i} className={`tile ${i % 11 === 4 ? "hot" : ""}`} style={i % 11 === 4 ? ({ "--hd": `${(i % 5) * 1.7}s` } as React.CSSProperties) : undefined}>
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={TILE_ICONS[i % TILE_ICONS.length]} />
                  </svg>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="shade" aria-hidden="true" />
      <div className="wrap content">
        <div className="hero-in max-w-[1130px]">
          <p className="eyebrow">{`// built on Chainlink rounds on ${CHAIN.name}`}</p>
          <h1 id="hero-h" className="h1 mt-5">
            {BRAND.slogan}
          </h1>
          <p className="lead mt-4 max-w-[1100px]">
            {BRAND.tagline} Write a rule, test it on prices the chain can prove, then watch it decide on live prices and say why it bought, sold or waited. Paper only.
          </p>
          <div className="mt-8">
            <Buttons />
          </div>
        </div>
        <div className="mt-10 flex justify-end">
          <Link href="/data" className="pill-link">
            Price data <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>
    </section>
  );
}

const CAPS = [
  "Average crosses",
  "Close vs its average",
  "% change over N bars",
  "Price levels",
  "Stop-loss",
  "Take-profit",
  "Max entries a day",
  "UTC hours and weekdays",
  "Stale-price guard",
  "Fee + slippage per fill",
  "Equity curve",
  "Max drawdown",
  "Buy and hold",
  "Decision reasons",
  "Round proofs",
  "Paper account on chain",
];

export function Capabilities() {
  const row = (k: string, list: string[]) =>
    list.concat(list).map((c, i) => (
      <span key={`${k}${i}`} className="chip">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M1.5 8.5l2.5 2.5L9 5.5M7 11l1 0L14 5" />
        </svg>
        {c}
      </span>
    ));
  return (
    <div className="grid gap-3 border-b border-line py-8" aria-label="What a rule can use">
      <div className="mq">
        <div className="mq-track">{row("a", CAPS.slice(0, 8))}</div>
      </div>
      <div className="mq rev">
        <div className="mq-track">{row("b", CAPS.slice(8))}</div>
      </div>
    </div>
  );
}

function SplitHead({ title, children, id }: { title: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <div className="split" id={id}>
      <Reveal>
        <h2 className="h2 max-w-[560px]">{title}</h2>
      </Reveal>
      <Reveal delay={120}>
        <p className="copy max-w-[460px] text-[16px]">{children}</p>
        <div className="mt-4">
          <Buttons note="Backtests run in your browser" />
        </div>
      </Reveal>
    </div>
  );
}

const FLOW_X = [120, 240, 360, 480, 600, 720];

export function Flow() {
  return (
    <section className="sec overflow-hidden border-b border-line" aria-labelledby="flow-h">
      <div className="arc" aria-hidden="true" />
      <div className="wrap">
        <SplitHead title={<span id="flow-h">Backtests you can check, bar by bar</span>}>
          Every close in a {BRAND.name} backtest is a Chainlink round with a number. Pick any bar, re-read its round on {CHAIN.name}, and get the same price the rule used.
        </SplitHead>
      </div>
      <div className="hatch mt-16 border-t border-line">
        <div className="wrap relative py-14" data-reveal="" data-flow="">
          <div className="mx-auto grid max-w-[860px] grid-cols-3 justify-items-center gap-y-6 sm:grid-cols-6">
            {MARKETS.map((m, i) => (
              <div key={m.id} className={`icon-tile card-hover ${i === 0 ? "hot" : ""}`} title={m.feedDescription}>
                <span className="font-serif text-[18px] font-bold">{m.id}</span>
              </div>
            ))}
          </div>
          <svg className="mx-auto mt-2 hidden h-[150px] w-full max-w-[860px] sm:block" viewBox="0 0 840 150" fill="none" aria-hidden="true">
            {FLOW_X.map((x, i) => (
              <g key={x}>
                <path className="flow-line" d={`M${x - 20 + i * 4} 0 C ${x - 20} 90, 420 60, 420 150`} stroke="rgba(255,255,255,.18)" strokeWidth="1.2" />
                <path className="flow-path" d={`M${x - 20 + i * 4} 0 C ${x - 20} 90, 420 60, 420 150`} stroke="#ff6a13" strokeWidth="1.4" opacity=".55" />
              </g>
            ))}
          </svg>
          <div className="mx-auto mt-6 grid max-w-[900px] items-start gap-6 sm:mt-0 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="code float" data-parallax="10">
              <div className="top">
                <span># rutiq.rule.json</span>
                <span className="text-[11px]">paper only</span>
              </div>
              <pre>
                <span className="ln">1</span>
                <span className="g">{"{"}</span> <span className="k">&quot;market&quot;</span>: <span className="o">&quot;ETH&quot;</span>, <span className="k">&quot;bar&quot;</span>: <span className="o">&quot;1h&quot;</span>,{"\n"}
                <span className="ln">2</span>
                {"  "}
                <span className="k">&quot;entry&quot;</span>: <span className="o">&quot;change over 4 bars ≥ +2%&quot;</span>,{"\n"}
                <span className="ln">3</span>
                {"  "}
                <span className="k">&quot;exit&quot;</span>: <span className="o">&quot;close below 8-bar average&quot;</span>,{"\n"}
                <span className="ln">4</span>
                {"  "}
                <span className="k">&quot;stop&quot;</span>: <span className="o">&quot;3%&quot;</span>, <span className="k">&quot;fee&quot;</span>: <span className="o">&quot;0.2%&quot;</span> <span className="g">{"}"}</span>
                <span className="caret" />
              </pre>
            </div>
            <div className="grid gap-3">
              <div className="wcard float d2 p-4" data-parallax="16">
                <p className="flex items-center justify-between text-[12px] text-[#8e9598]">
                  <b className="text-[14px] text-[#111]">Decision</b> bar close 14:00 UTC
                </p>
                <p className="mt-2 text-[13px] leading-[19px] text-[#111]">Waited: change +1.4 % over 4 bars, below the +2 % entry threshold.</p>
              </div>
              <div className="wcard flex items-center gap-3 p-3" data-parallax="22">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-[var(--orange)] font-serif text-[13px] font-bold text-white">R#</span>
                <span className="min-w-0">
                  <b className="block text-[15px] text-[#333]">Chainlink round</b>
                  <span className="text-[12px] text-[#8e9598]">published before the bar end, next one after it</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const FEATS = [
  ["Rule builder", "Entry and exit conditions on price, moving averages and % change; size, stop-loss, take-profit, a daily entry limit, UTC hours and weekdays, and a stale-price guard. Every field has a limit you can read."],
  ["Proven price history", `Six markets, each a Chainlink feed on ${CHAIN.name}: ETH and five stock tokens checked on chain. Thousands of rounds, each one re-readable with its round number.`],
  ["Backtests with costs", "Fee and slippage on every fill, maximum drawdown, the trades, and buy-and-hold side by side, over 7, 30, 90 days or the whole history."],
  ["Paper trading", "Start an agent and it decides at every bar close on live rounds with virtual cash. The log is recomputed from chain data, so it can be replayed exactly."],
  ["Decision log on chain", "Commit decisions to RutiqDecisionLog: the contract proves each close, recomputes the rule and refuses anything the rule would not do. Live on Robinhood Chain and verified on the explorer."],
  ["Honest limits", "Paper only. No funds, no orders, no advice. Skipped bars are counted, stale prices are flagged, and real-fund execution stays a later stage."],
];

export function Features() {
  return (
    <section className="sec" aria-labelledby="feat-h">
      <div className="wrap">
        <SplitHead title={<span id="feat-h">More than a backtest button</span>}>
          A backtest is the floor. A rule that keeps deciding on live prices, and explains every decision in plain words, is the point.
        </SplitHead>
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
          <ol>
            {FEATS.map(([t, d], i) => (
              <li key={t} className="feat" data-feat={i}>
                <p className="n">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="h3 t">{`// ${t}`}</h3>
                <p className="copy mt-3 max-w-[480px] text-[14px] leading-[22px]">{d}</p>
                <Link href={["/studio", "/data", "/studio", "/paper", "/log", "/docs#risks"][i]} className="textlink mt-4 text-[14px]">
                  Open <ArrowUpRight size={12} />
                </Link>
              </li>
            ))}
          </ol>
          <div className="hidden lg:block">
            <div className="sticky top-36">
              <FeatureStack count={FEATS.length} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Terminal() {
  return (
    <section className="sec pt-8" aria-labelledby="term-h">
      <div className="wrap">
        <Reveal>
          <h2 id="term-h" className="h2 mx-auto max-w-[620px] text-center">
            Every decision, with its reason
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div data-scale="">
            <DecisionTerminal />
          </div>
          <div className="grid gap-4">
            <Reveal className="card p-6 md:p-8">
              <h3 className="font-sans text-[24px] font-semibold tracking-[-0.03em] md:text-[26px]">Waiting is a decision too</h3>
              <p className="copy mt-3">
                Most bars end in a wait. The log says which rule held it back — the entry not met, outside the schedule, the daily limit, or a price too old to trust — with the numbers it
                compared.
              </p>
            </Reveal>
            <Reveal className="card p-6 md:p-8" delay={120}>
              <h3 className="font-sans text-[24px] font-semibold tracking-[-0.03em] md:text-[26px]">Replays that match, number for number</h3>
              <p className="copy mt-3">The site and the contract share the same integer math. A parity suite replays 991 bars through both and requires the same action, reason, cash and units every time.</p>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

const PRODUCTS: { href: string; t: string; d: string; icon: string; status: "Prototype" | "Concept" }[] = [
  { href: "/studio", t: "Rule studio", d: "Write a rule and backtest it on proven history", icon: "M8 8l-4 4 4 4M16 8l4 4-4 4", status: "Prototype" },
  { href: "/paper", t: "Paper agents", d: "Decide on live prices with virtual cash", icon: "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", status: "Prototype" },
  { href: "/log", t: "Decision log", d: "Commit decisions the contract re-checks", icon: "M6 4h12v16l-3-2-3 2-3-2-3 2zM9 9h6M9 13h6", status: "Prototype" },
];

export function Products() {
  return (
    <section className="sec border-t border-line" aria-labelledby="prod-h">
      <div className="wrap">
        <SplitHead title={<span id="prod-h">Three tools, one rule</span>}>Write it once. The same rule runs the backtest, the paper agent and the on-chain check.</SplitHead>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {PRODUCTS.map((p, i) => (
            <Reveal key={p.href} delay={i * 80}>
              <Link href={p.href} className="card card-hover hatch block overflow-hidden">
                <div className="grid h-[150px] place-items-center border-b border-line">
                  <span className="grid h-[72px] w-[72px] place-items-center rounded-xl bg-white text-[#111] shadow-[0_20px_40px_-20px_rgba(0,0,0,.9)]">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d={p.icon} />
                    </svg>
                  </span>
                </div>
                <div className="p-5">
                  <p className="flex items-center justify-between gap-2 text-[16px] font-medium">
                    {p.t} <StatusBadge status={p.status} />
                  </p>
                  <p className="mt-1 text-[14px] text-[#8a8a8a]">{p.d}</p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const TAGS = ["// Average crosses //", "// Stop-loss //", "// UTC schedule //", "// Round ids //", "// Equity curve //", "// Buy and hold //", "// Drawdown //", "// Fees per fill //", "// Paper cash //", "// Decision reasons //", "// Stale-price guard //", "// Take-profit //"];

export function StartBuilding() {
  return (
    <section className="sec relative isolate overflow-hidden border-t border-line pb-0" aria-labelledby="start-h">
      <div className="wrap">
        <SplitHead title={<span id="start-h">Start testing in minutes</span>}>Pick a starting point, change what you like, and read the result. No sign-up, no wallet and no funds.</SplitHead>
      </div>
      <div className="relative mt-14 pb-24">
        <div className="glow-bottom" aria-hidden="true" />
        <div className="wrap relative">
          <div className="mx-auto flex max-w-[860px] flex-wrap justify-center gap-2" data-reveal="">
            {TAGS.map((t) => (
              <span key={t} className="rounded-sm bg-[rgba(255,106,19,.12)] px-2 py-1 text-[14px] font-semibold text-white/90">
                {t}
              </span>
            ))}
          </div>
          <div className="code mx-auto mt-6 max-w-[460px]" data-reveal="">
            <div className="top">
              <span># studio</span>
              <span>4 steps</span>
            </div>
            <pre>
              <span className="ln">1</span>
              <span className="g">$</span> <span className="k">pick a market</span> ETH | NVDA | TSLA | AAPL | SPY | QQQ{"\n"}
              <span className="ln">2</span>
              <span className="g">$</span> <span className="k">write</span> entry + exit + limits{"\n"}
              <span className="ln">3</span>
              <span className="g">$</span> <span className="k">backtest</span> on Chainlink rounds{"\n"}
              <span className="ln">4</span>
              <span className="g">$</span> <span className="k">run on paper</span> and read the log
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Faq() {
  return (
    <section className="sec border-t border-line" aria-labelledby="faq-h">
      <div className="wrap grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Reveal>
          <p className="eyebrow">{"// FAQ //"}</p>
          <h2 id="faq-h" className="h2 mt-4">
            Questions, answered plainly
          </h2>
          <p className="copy mt-4 max-w-[420px]">What is real, what is simulated, and what the chain can and cannot prove.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/studio" className="btn btn-orange">
              Open the studio
            </Link>
            <Link href="/docs" className="btn btn-white">
              Read the docs
            </Link>
          </div>
        </Reveal>
        <Reveal className="faq" delay={100}>
          {FAQ.map((f, i) => (
            <details key={f.q} open={i === 0}>
              <summary>
                {f.q} <span className="pm">+</span>
              </summary>
              <p className="a">{f.a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

export function Closing() {
  return (
    <section className="sec relative isolate overflow-hidden border-t border-line" aria-labelledby="close-h">
      <div className="glow-bottom" aria-hidden="true" />
      <div className="wrap split">
        <Reveal>
          <h2 id="close-h" className="h2 max-w-[560px]">
            Write the rule. Watch it decide.
          </h2>
        </Reveal>
        <Reveal delay={120}>
          <p className="copy max-w-[460px]">
            {BRAND.name} is a working prototype on {CHAIN.name}: the studio and paper trading run today on live chain data, and the decision log contract is live on chain. Trading real funds and {BRAND.symbol} compute credits are planned.
            Simulated results never guarantee profit.
          </p>
          <div className="mt-4">
            <Buttons />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export { PriceMarquee };
