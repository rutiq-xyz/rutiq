"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { explorerAddress } from "@/config/brand";
import { MARKETS } from "@/config/markets.generated";
import { DecisionTable } from "@/components/app/DecisionTable";
import { EquityChart } from "@/components/app/EquityChart";
import { RuleEditor } from "@/components/app/RuleEditor";
import { addAgent, loadDraft, saveDraft } from "@/components/app/store";
import { LiveBadge, StatusBadge } from "@/components/site/PageHead";
import { useHistory } from "@/components/live/data";
import { paramsHash, specHash } from "@/lib/engine/abi";
import { backtest } from "@/lib/engine/backtest";
import { describeCondition, fmtAge, micro, pct, usd } from "@/lib/engine/explain";
import { formToParams, paramsToForm, type RuleForm } from "@/lib/engine/form";
import { PRESETS } from "@/lib/engine/presets";
import { closesNeeded, ruleProblems } from "@/lib/engine/rules";
import { afterMount, useNow } from "@/lib/useNow";

const WINDOWS = [
  { id: "7d", label: "7 days", sec: 7 * 86_400 },
  { id: "30d", label: "30 days", sec: 30 * 86_400 },
  { id: "90d", label: "90 days", sec: 90 * 86_400 },
  { id: "all", label: "All history", sec: 0 },
] as const;

function defaultForm(): RuleForm {
  const m = MARKETS[0];
  return paramsToForm(PRESETS[0].build(m.feed, 0n), m.id, PRESETS[0].name);
}

export function Studio() {
  const router = useRouter();
  const [form, setForm] = useState<RuleForm>(defaultForm);
  const [win, setWin] = useState<(typeof WINDOWS)[number]["id"]>("30d");
  const [ready, setReady] = useState(false);
  useEffect(
    () =>
      afterMount(() => {
        const d = loadDraft();
        if (d && MARKETS.some((m) => m.id === d.market)) setForm(d);
        setReady(true);
      }),
    [],
  );
  const now = useNow(60_000);
  useEffect(() => {
    if (ready) saveDraft(form);
  }, [form, ready]);

  const { data: hist, error, loading } = useHistory(form.market);
  const params = useMemo(() => formToParams(form), [form]);
  const problems = useMemo(() => ruleProblems(params), [params]);
  const last = hist?.rounds[hist.rounds.length - 1] ?? null;

  const result = useMemo(() => {
    if (!hist || problems.length || hist.market.id !== form.market) return null;
    const end = now - 120;
    const w = WINDOWS.find((x) => x.id === win)!;
    const start = w.sec ? end - w.sec : hist.rounds[0].updatedAt;
    return backtest(params, hist.rounds, start, end);
  }, [hist, params, problems.length, win, form.market, now]);

  const applyPreset = (id: string) => {
    const pr = PRESETS.find((p) => p.id === id);
    const m = MARKETS.find((x) => x.id === form.market) ?? MARKETS[0];
    if (pr) setForm(paramsToForm(pr.build(m.feed, last?.answer ?? 0n), m.id, pr.name));
  };

  const sendToPaper = () => {
    addAgent(form);
    router.push("/paper");
  };

  const spec = useMemo(() => ({ app: "rutiq", v: 1, name: form.name, market: form.market, params: { ...params, startCash: params.startCash.toString() } }), [form, params]);
  const exportSpec = () => {
    const blob = new Blob([JSON.stringify({ ...spec, entry: params.entry, exit: params.exit }, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rutiq-rule-${form.market.toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="wrap grid gap-6 py-10 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]" data-testid="studio">
      <section className="panel self-start" aria-label="Rule builder">
        <div className="panel-h">
          <h2 className="h3 text-[19px]">1 · Write the rule</h2>
          <StatusBadge status="Prototype" />
        </div>
        <div className="panel-b grid gap-6">
          <div>
            <span className="label">Start from</span>
            <div className="flex flex-wrap gap-2" data-testid="presets">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" className="btn btn-line sm normal-case" title={p.note} onClick={() => applyPreset(p.id)}>
                  {p.name}
                </button>
              ))}
            </div>
            <p className="small mt-2">Starting points, not recommendations. Every value below is yours to change.</p>
          </div>
          <label className="block">
            <span className="label">Name</span>
            <input className="input" value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="rule-name" />
          </label>
          <RuleEditor form={form} onChange={setForm} />
          {problems.length ? (
            <div className="note note-warn" data-testid="problems">
              {problems.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          ) : (
            <div className="small grid gap-1" data-testid="rule-summary">
              <p>
                <b className="text-white">In:</b> {describeCondition(params.entry, params.interval)}.
              </p>
              <p>
                <b className="text-white">Out:</b> {describeCondition(params.exit, params.interval)}
                {params.stopBps ? `, stop ${pct(params.stopBps)}` : ""}
                {params.takeProfitBps ? `, take-profit ${pct(params.takeProfitBps)}` : ""}.
              </p>
              <p>Needs {closesNeeded(params)} bar close{closesNeeded(params) === 1 ? "" : "s"} per decision. Paper only: nothing is ever traded.</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-orange" onClick={sendToPaper} disabled={problems.length > 0} data-testid="to-paper">
              Run it on paper
              <Arrow />
            </button>
            <button type="button" className="btn btn-white" onClick={exportSpec} disabled={problems.length > 0}>
              Export spec
            </button>
          </div>
          {!problems.length ? (
            <p className="src break-all">
              paramsHash {paramsHash(params)} · specHash {specHash(spec)}
            </p>
          ) : null}
        </div>
      </section>

      <section className="grid min-w-0 gap-6 self-start" aria-label="Backtest">
        <div className="panel">
          <div className="panel-h flex-wrap">
            <h2 className="h3 text-[19px]">2 · Backtest on chain history</h2>
            <div className="seg" role="group" aria-label="Window">
              {WINDOWS.map((w) => (
                <button key={w.id} type="button" aria-pressed={win === w.id} onClick={() => setWin(w.id)} data-testid={`win-${w.id}`}>
                  {w.label}
                </button>
              ))}
            </div>
          </div>
          <div className="panel-b grid gap-5">
            {hist ? (
              <p className="src flex flex-wrap items-center gap-2" data-testid="history-source">
                <LiveBadge label="Chainlink rounds" /> {hist.rounds.length.toLocaleString("en-US")} rounds of{" "}
                <a href={explorerAddress(hist.meta.feed)} target="_blank" rel="noreferrer">
                  {hist.market.feedDescription}
                </a>{" "}
                on Robinhood Chain, newest {last ? fmtAge(now - last.updatedAt) : "—"} old.
                {hist.meta.complete ? "" : " Newest rounds could not all be read just now; the backtest uses what was read."}
              </p>
            ) : null}
            {error ? <p className="note note-warn">{error}</p> : null}
            {loading && !hist ? <p className="small">Loading the round history…</p> : null}
            {result ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="stats">
                  <Stat k="Rule result" v={pct(result.returnBps, true)} tone={result.returnBps} testid="stat-return" />
                  <Stat k="Buy and hold" v={pct(result.buyHoldBps, true)} tone={result.buyHoldBps} testid="stat-hold" />
                  <Stat k="Max drawdown" v={result.maxDrawdownBps ? `-${pct(result.maxDrawdownBps)}` : "0.00 %"} sub={`hold: -${pct(result.buyHoldDrawdownBps)}`} />
                  <Stat k="Fees + slippage" v={usd(micro(result.fees))} sub={`${result.entries} entr${result.entries === 1 ? "y" : "ies"}, ${result.wins} closed in profit`} />
                </div>
                <EquityChart steps={result.steps} startCash={result.startCash} feeBps={params.feeBps} />
                <p className="note" data-testid="disclaimer">
                  A simulation on past prices, not a forecast and not advice. It never guarantees profit: real trades would face spreads, depth, delays and
                  costs this model only approximates ({pct(params.feeBps)} per fill). Fills are at the proven close of the decision bar.
                  {result.staleBars ? ` ${result.staleBars} bars were skipped because the feed's latest round was older than your limit (markets closed, feed quiet).` : ""}
                  {result.warmupBars ? ` ${result.warmupBars} bars before the history was long enough were not traded.` : ""}
                </p>
              </>
            ) : null}
          </div>
        </div>
        {result ? (
          <div className="panel">
            <div className="panel-h">
              <h2 className="h3 text-[19px]">3 · Every decision, with its reason</h2>
              <Link href="/docs#check" className="textlink text-[13px]">
                How a close is proven ↗
              </Link>
            </div>
            <div className="panel-b">
              <DecisionTable steps={result.steps} params={params} />
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Stat({ k, v, sub, tone, testid }: { k: string; v: string; sub?: string; tone?: number; testid?: string }) {
  return (
    <div className="stat" data-testid={testid}>
      <p className="k">{k}</p>
      <p className={`v ${tone === undefined ? "" : tone > 0 ? "pos" : tone < 0 ? "neg" : ""}`}>{v}</p>
      {sub ? <p className="mt-1 text-[11px] text-white/50">{sub}</p> : null}
    </div>
  );
}

export function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}
