import Link from "next/link";
import { BRAND, CHAIN, hasGithub } from "@/config/brand";
import { CaBox } from "@/components/site/CaCopy";
import { MarkTile } from "@/components/site/Mark";
import { GithubIcon, XIcon } from "@/components/site/Icons";

const COLS: { h: string; links: { href: string; label: string; ext?: boolean }[] }[] = [
  {
    h: "Product",
    links: [
      { href: "/studio", label: "Rule studio" },
      { href: "/paper", label: "Paper trading" },
      { href: "/log", label: "Decision log" },
      { href: "/data", label: "Price data" },
    ],
  },
  {
    h: "Learn",
    links: [
      { href: "/docs", label: "How it works" },
      { href: "/docs#check", label: "How a decision is checked" },
      { href: "/docs#risks", label: "Risks and limits" },
      { href: "/token", label: `${BRAND.symbol} (planned)` },
    ],
  },
  {
    h: "Network",
    links: [
      { href: CHAIN.explorer, label: "Robinhood Chain explorer", ext: true },
      { href: "/data#feeds", label: "Chainlink feeds used" },
      { href: "/log#contract", label: "RutiqDecisionLog" },
    ],
  },
];

const GLOSSARY = ["Backtest", "Paper trading", "Chainlink round", "Bar close", "Moving average", "Stop-loss", "Take-profit", "Drawdown", "Buy and hold", "Decision log"];

/* As the UI reference: a short lead with the product line, link columns with mono labels, glossary chips, social squares, a mono
 * copyright line, then the giant faded wordmark with the logo tile. */
export function SiteFooter() {
  return (
    <footer className="ft mt-24" data-testid="footer">
      <div className="wrap grid gap-12 pt-16 lg:grid-cols-[1fr_2fr]">
        <div>
          <p className="font-serif text-[24px] leading-[1.15] font-bold tracking-[-0.02em]">
            Rules you can read.
            <br />
            Decisions you can check<span className="text-orange">.</span>
          </p>
          <p className="small mt-4 max-w-[340px]">
            {BRAND.name}: {BRAND.slogan} {BRAND.tagline} Paper only: no funds, no orders. Simulated results never guarantee profit and are not advice.
          </p>
          <CaBox testid="footer-ca" className="mt-6" />
        </div>
        <div className="ft-cols grid grid-cols-2 gap-8 sm:grid-cols-3">
          {COLS.map((c) => (
            <div key={c.h}>
              <h4>{c.h}</h4>
              <ul className="mt-3">
                {c.links.map((l) => (
                  <li key={l.href}>
                    {l.ext ? (
                      <a href={l.href} target="_blank" rel="noreferrer">
                        {l.label} ↗
                      </a>
                    ) : (
                      <Link href={l.href}>{l.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="wrap mt-12 border-t border-line pt-6">
        <h4 className="ft-h4">Glossary</h4>
        <ul className="mt-3 flex flex-wrap gap-2">
          {GLOSSARY.map((g) => (
            <li key={g}>
              <Link href={`/docs#glossary`} className="inline-flex h-7 items-center rounded-full border border-line px-3 text-[12px] text-white/70 hover:border-[var(--line-2)]">
                {g}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="wrap mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 pb-8">
        <div className="flex items-center gap-2">
          <a className="soc" href={BRAND.x} target="_blank" rel="noreferrer" aria-label={`${BRAND.name} on X`}>
            <XIcon size={13} />
          </a>
          {hasGithub ? (
            <a className="soc" href={BRAND.github} target="_blank" rel="noreferrer" aria-label="Source code on GitHub">
              <GithubIcon size={14} />
            </a>
          ) : null}
        </div>
        <p className="copyline">
          © 2026 {BRAND.name} · {CHAIN.name} · chain {CHAIN.id} · not affiliated with Robinhood
        </p>
      </div>
      <div className="relative mb-12 sm:mb-0" aria-hidden="true" data-reveal="">
        <p className="giant">rutiq</p>
        <div className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_20px_40px_rgba(0,0,0,.6)]">
          <MarkTile size={84} />
        </div>
      </div>
    </footer>
  );
}
