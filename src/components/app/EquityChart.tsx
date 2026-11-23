"use client";

import { useMemo } from "react";
import type { Step } from "@/lib/engine/backtest";
import { ACTION } from "@/lib/engine/rules";
import { usd } from "@/lib/engine/explain";

/* Equity of the rule vs buying and holding, per bar, with buy/sell markers. Own SVG; the line draws in on every new run. */
export function EquityChart({ steps, startCash, feeBps, height = 260, testid = "equity" }: { steps: Step[]; startCash: bigint; feeBps: number; height?: number; testid?: string }) {
  const geo = useMemo(() => {
    if (steps.length < 2) return null;
    const p0 = steps[0].price;
    const bhUnits = ((startCash - (startCash * BigInt(feeBps)) / 10_000n) * 10n ** 20n) / p0;
    const eq = steps.map((s) => Number(s.equity) / 1e6);
    const bh = steps.map((s) => Number((bhUnits * s.price) / 10n ** 20n) / 1e6);
    const all = eq.concat(bh);
    let lo = Math.min(...all);
    let hi = Math.max(...all);
    const pad = (hi - lo) * 0.08 || hi * 0.02 || 1;
    lo -= pad;
    hi += pad;
    const W = 1000;
    const H = 300;
    const x = (i: number) => (i / (steps.length - 1)) * W;
    const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
    const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const marks = steps.flatMap((s, i) => (s.action === ACTION.HOLD ? [] : [{ x: x(i), y: y(eq[i]), buy: s.action === ACTION.BUY }]));
    return { W, H, eqPath: path(eq), bhPath: path(bh), marks, lo, hi, first: steps[0].barEnd, last: steps[steps.length - 1].barEnd, key: `${steps.length}-${steps[steps.length - 1].equity}` };
  }, [steps, startCash, feeBps]);
  if (!geo) return <div className="small grid place-items-center rounded-xl border border-line" style={{ height }}>Not enough bars to draw.</div>;
  const d = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
  return (
    <figure className="relative" data-testid={testid}>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-[12px] text-white/70">
        <span className="inline-flex items-center gap-2">
          <i className="inline-block h-[3px] w-5 rounded bg-[var(--orange)]" /> Rule (paper equity)
        </span>
        <span className="inline-flex items-center gap-2">
          <i className="inline-block h-[3px] w-5 rounded bg-white/40" /> Buy and hold
        </span>
        <span className="inline-flex items-center gap-2">
          <i className="inline-block h-2 w-2 rounded-full bg-[var(--good)]" /> buy <i className="ml-1 inline-block h-2 w-2 rounded-full bg-[var(--bad)]" /> sell
        </span>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-line bg-[#0d0d0d]" style={{ height }}>
        <svg key={geo.key} viewBox={`0 0 ${geo.W} ${geo.H}`} preserveAspectRatio="none" className="draw-in absolute inset-0 h-full w-full" role="img" aria-label="Equity curve of the rule against buy and hold">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={geo.W} y1={geo.H * f} y2={geo.H * f} stroke="rgba(255,255,255,.06)" vectorEffect="non-scaling-stroke" />
          ))}
          <path className="line" d={geo.bhPath} fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" pathLength={4000} />
          <path className="line" d={geo.eqPath} fill="none" stroke="#ff6a13" strokeWidth="2" vectorEffect="non-scaling-stroke" pathLength={4000} />
        </svg>
        <div className="pointer-events-none absolute inset-0">
          {geo.marks.slice(0, 400).map((m, i) => (
            <i key={i} className={`absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full ${m.buy ? "bg-[var(--good)]" : "bg-[var(--bad)]"}`} style={{ left: `${(m.x / geo.W) * 100}%`, top: `${(m.y / geo.H) * 100}%` }} />
          ))}
        </div>
        <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 text-[11px] text-white/60">{usd(geo.hi, 0)}</span>
        <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 text-[11px] text-white/60">{usd(geo.lo, 0)}</span>
      </div>
      <figcaption className="mt-2 flex justify-between text-[11px] text-white/50">
        <span>{d(geo.first)}</span>
        <span>{d(geo.last)} (UTC bar closes)</span>
      </figcaption>
    </figure>
  );
}
