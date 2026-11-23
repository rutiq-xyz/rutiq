"use client";

import { useState } from "react";
import type { Step } from "@/lib/engine/backtest";
import { aggRoundOf } from "@/lib/engine/bars";
import { ACTION_LABEL, REASON_LABEL, explainDecision, fmtAge, fmtBar, micro, usd, usdPrice } from "@/lib/engine/explain";
import { ACTION, type RuleParams } from "@/lib/engine/rules";
import { VerifyRound } from "@/components/app/VerifyRound";

/* Decision log: every bar with the action, the reason in words, the price round it used and the equity after it. Newest first. */
export function DecisionTable({ steps, params, pageSize = 25, testid = "decisions", newest = true }: { steps: Step[]; params: RuleParams; pageSize?: number; testid?: string; newest?: boolean }) {
  const [onlyActions, setOnlyActions] = useState(false);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  // entry price per step, to explain stops and take-profits
  const entries: (bigint | null)[] = [];
  let entry: bigint | null = null;
  for (const s of steps) {
    entries.push(entry);
    if (s.action === ACTION.BUY) entry = s.price;
    if (s.action === ACTION.SELL) entry = null;
  }
  const rows = steps.map((s, i) => ({ s, i })).filter((r) => !onlyActions || r.s.action !== ACTION.HOLD);
  if (newest) rows.reverse();
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const shown = rows.slice(cur * pageSize, cur * pageSize + pageSize);
  return (
    <div data-testid={testid}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="seg" role="group" aria-label="Rows">
          <button type="button" aria-pressed={!onlyActions} onClick={() => (setOnlyActions(false), setPage(0))}>
            Every bar ({steps.length})
          </button>
          <button type="button" aria-pressed={onlyActions} onClick={() => (setOnlyActions(true), setPage(0))}>
            Buys and sells ({steps.filter((s) => s.action !== ACTION.HOLD).length})
          </button>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-white/60">
          <button type="button" className="btn btn-line sm" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Newer">
            ←
          </button>
          <span className="tabular-nums">
            {cur + 1} / {pages}
          </span>
          <button type="button" className="btn btn-line sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Older">
            →
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-line">
        <table className="tbl">
          <thead>
            <tr>
              <th className="w-[36%] sm:w-[19%]">Bar close</th>
              <th className="w-[24%] sm:w-[14%]">Action</th>
              <th className="hidden sm:table-cell">Why</th>
              <th className="w-[40%] text-right sm:w-[18%]">Price · equity</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ s, i }) => (
              <FragmentRow key={s.barEnd} s={s} params={params} entry={entries[i]} open={open === s.barEnd} toggle={() => setOpen(open === s.barEnd ? null : s.barEnd)} />
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <p className="small mt-3">No bars yet.</p> : null}
    </div>
  );
}

function FragmentRow({ s, params, entry, open, toggle }: { s: Step; params: RuleParams; entry: bigint | null; open: boolean; toggle: () => void }) {
  const why = explainDecision(params, s.reason, s.closes, s.barEnd, s.age, entry);
  return (
    <>
      <tr className="row-in cursor-pointer hover:bg-white/[.02]" onClick={toggle} aria-expanded={open}>
        <td className="tabular-nums">
          {fmtBar(s.barEnd).replace(" UTC", "")}
          <span className="block text-[11px] text-white/45">round {aggRoundOf(s.roundId).toString()}</span>
        </td>
        <td>
          <span className={`act act-${s.action}`}>{ACTION_LABEL[s.action].toUpperCase()}</span>
          <span className="mt-1 block text-[11px] text-white/50">{REASON_LABEL[s.reason]}</span>
        </td>
        <td className="hidden text-white/75 sm:table-cell">{why}</td>
        <td className="text-right tabular-nums">
          {usdPrice(s.price)}
          <span className="block text-[11px] text-white/50">{usd(micro(s.equity))}</span>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={4} className="bg-black/30">
            <p className="text-white/80 sm:hidden">{why}</p>
            <p className="small mt-1">
              Close from Chainlink round {aggRoundOf(s.roundId).toString()}, published {fmtAge(s.age)} before the bar ended. The decision used {s.roundIds.length} close{s.roundIds.length === 1 ? "" : "s"} (rounds {s.roundIds.map((r) => aggRoundOf(r).toString()).join(", ")}). {s.fee > 0n ? `Fee charged: ${usd(micro(s.fee))}.` : ""}
            </p>
            <div className="mt-3">
              <VerifyRound feed={params.feed} roundId={s.roundId} barEnd={s.barEnd} answer={s.price} testid={`verify-${s.barEnd}`} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
