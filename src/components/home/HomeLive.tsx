"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MARKETS } from "@/config/markets.generated";
import { useHistory, useLatest } from "@/components/live/data";
import { backtest } from "@/lib/engine/backtest";
import { aggRoundOf } from "@/lib/engine/bars";
import { ACTION_LABEL, explainDecision, fmtAge, fmtBar, pct, usdPrice } from "@/lib/engine/explain";
import { PRESETS } from "@/lib/engine/presets";
import { ACTION } from "@/lib/engine/rules";
import { afterMount, useNow } from "@/lib/useNow";

/* Live price marquee (the reference's logo row, filled with real Chainlink rounds instead of customer logos). */
export function PriceMarquee() {
  const { data } = useLatest(30_000);
  const now = useNow(30_000);
  const items = MARKETS.map((m) => {
    const r = data?.rows.find((x) => x.id === m.id);
    const ok = r && !("error" in r);
    return { id: m.id, label: m.kind === "stock" ? m.label : "Ether", price: ok ? usdPrice(BigInt(r.answer)) : "—", age: ok ? fmtAge(now - r.updatedAt) : "…" };
  });
  const row = (k: string) =>
    items.map((i) => (
      <span key={`${k}-${i.id}`} className="ticker">
        <b>{i.id}</b>
        <span className="text-white/55">{i.label}</span>
        <span className="tabular-nums">{i.price}</span>
        <span className="text-[11px] text-white/40">{i.age}</span>
      </span>
    ));
  return (
    <div className="flex items-center gap-6 border-b border-line py-5" data-testid="price-marquee">
      <p className="hidden w-[210px] shrink-0 pl-[var(--gutter)] text-[14px] text-white/70 lg:block">Live Chainlink rounds on Robinhood Chain</p>
      <div className="mq min-w-0 flex-1" style={{ "--mq-speed": "52s" } as React.CSSProperties}>
        <div className="mq-track" aria-hidden={!data}>
          {row("a")}
          {row("b")}
        </div>
      </div>
    </div>
  );
}

/* Sticky isometric stack beside the numbered features: the tile of the feature in view turns orange (reference behaviour). */
export function FeatureStack({ count }: { count: number }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>("[data-feat]")];
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.feat));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  const icons = ["M5 12h14M12 5v14", "M4 17l5-5 4 3 7-8", "M5 19V9M10 19V5M15 19v-7M20 19v-11", "M12 6v6l4 2", "M6 4h12v16l-3-2-3 2-3-2-3 2z", "M12 3l8 4v6c0 4-3.5 7-8 8-4.5-1-8-4-8-8V7z"];
  return (
    <div className="stack" data-testid="feature-stack" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`iso ${active === i ? "on" : ""}`} style={{ left: `${40 + i * 44}px`, top: `${250 - i * 40}px`, zIndex: 10 - i }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d={icons[i % icons.length]} />
          </svg>
        </div>
      ))}
    </div>
  );
}

/*
 * The reference's recording card, reworked as a decision terminal: a real replay of the Momentum preset on the last 72 hourly ETH/USD
 * closes (Chainlink rounds), rows ticking in one by one, a Backtest / Paper tab pill sliding on a loop, equaliser bars and a live dot.
 */
export function DecisionTerminal() {
  const eth = MARKETS[0];
  const { data: hist } = useHistory(eth.id);
  const now = useNow(300_000);
  const steps = useMemo(() => {
    if (!hist) return [];
    const p = PRESETS[2].build(eth.feed, 0n);
    const end = Math.floor((now - 120) / 3600) * 3600;
    return { p, s: backtest(p, hist.rounds, end - 72 * 3600, end) };
  }, [hist, eth.feed, now]);
  const [shown, setShown] = useState(6);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!("s" in steps)) return;
    const total = steps.s.steps.length;
    const first = afterMount(() => setShown(Math.min(6, total)));
    const t = setInterval(() => document.visibilityState === "visible" && setShown((n) => (n >= total ? 6 : n + 1)), 1600);
    return () => {
      first();
      clearInterval(t);
    };
  }, [steps]);
  const run = "s" in steps ? steps.s : null;
  const list = run ? run.steps.slice(0, shown).slice(-6).reverse() : [];
  return (
    <div className="card overflow-hidden bg-black p-0" data-testid="terminal" ref={ref}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <span className="flex items-center gap-2 text-[12px]">
          <i className="rec inline-block h-2 w-2 rounded-full bg-[var(--orange)]" />
          <b>REPLAY</b> <span className="hidden text-white/50 sm:inline">Momentum · ETH / USD · 1 h bars</span>
        </span>
        <span className="relative grid grid-cols-2 rounded-lg border border-line bg-[#141414] p-[3px] text-[11px]">
          <i className="tabs-pill absolute inset-y-[3px] left-[3px] w-[calc(50%-3px)] rounded-md bg-[var(--orange)]" />
          <span className="relative z-10 px-3 py-1">Backtest</span>
          <span className="relative z-10 px-3 py-1">Paper</span>
        </span>
      </div>
      <div className="grid gap-px bg-[var(--line)] sm:grid-cols-[minmax(0,1fr)_150px]">
        <ul className="min-h-[300px] bg-black p-3" data-testid="terminal-rows">
          {run
            ? list.map((s) => (
                <li key={s.barEnd} className="row-in mb-2 rounded-lg border border-line bg-[#111] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`act act-${s.action}`}>{ACTION_LABEL[s.action].toUpperCase()}</span>
                    <span className="text-[11px] text-white/45 tabular-nums">
                      {fmtBar(s.barEnd).slice(5, 16)} · round {aggRoundOf(s.roundId).toString()}
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] leading-[17px] text-white/70">{explainDecision(steps && "p" in steps ? steps.p : PRESETS[2].build(eth.feed, 0n), s.reason, s.closes, s.barEnd, s.age, null)}</p>
                </li>
              ))
            : Array.from({ length: 4 }, (_, i) => <li key={i} className="mb-2 h-[62px] rounded-lg border border-line bg-[#111]" />)}
        </ul>
        <div className="hidden flex-col justify-between bg-black p-4 sm:flex">
          <div>
            <p className="text-[11px] text-white/50">Rule vs hold</p>
            <p className={`mt-1 font-serif text-[22px] font-bold ${run && run.returnBps >= run.buyHoldBps ? "pos" : ""}`}>{run ? pct(run.returnBps, true) : "—"}</p>
            <p className="text-[11px] text-white/50">hold {run ? pct(run.buyHoldBps, true) : "—"}</p>
          </div>
          <div className="flex h-16 items-end gap-1" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <i key={i} className="eqbar block w-2 rounded-sm bg-[var(--orange)]" style={{ height: `${30 + ((i * 37) % 60)}%`, animationDelay: `${-i * 0.17}s` }} />
            ))}
          </div>
          <p className="text-[11px] text-white/50">{run ? `${run.steps.filter((s) => s.action !== ACTION.HOLD).length} fills in 72 bars` : "loading rounds"}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3 text-[11px] text-white/60">
        <span className="rounded border border-line px-2 py-0.5">✓ real Chainlink rounds</span>
        <span className="rounded border border-line px-2 py-0.5">✓ same math as the contract</span>
        <Link href="/studio" className="rounded border border-line px-2 py-0.5 hover:border-[var(--orange)]">
          ✓ edit it in the studio →
        </Link>
      </div>
    </div>
  );
}
