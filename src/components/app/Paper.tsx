"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MARKETS } from "@/config/markets.generated";
import { Arrow } from "@/components/app/Studio";
import { DecisionTable } from "@/components/app/DecisionTable";
import { EquityChart } from "@/components/app/EquityChart";
import { addAgent, loadAgents, saveAgents, type PaperAgent } from "@/components/app/store";
import { LiveBadge, StatusBadge } from "@/components/site/PageHead";
import { useHistory, useLatest } from "@/components/live/data";
import { backtest } from "@/lib/engine/backtest";
import { closesAt } from "@/lib/engine/bars";
import { ACTION_LABEL, describeCondition, explainDecision, fmtAge, fmtBar, micro, pct, usd, usdPrice } from "@/lib/engine/explain";
import { formToParams, paramsToForm } from "@/lib/engine/form";
import { PRESETS } from "@/lib/engine/presets";
import { closesNeeded, decide, equity, initialState } from "@/lib/engine/rules";
import { afterMount, useNow } from "@/lib/useNow";

const SETTLE = 120;

/*
 * Paper trading: an agent decides at every bar close after it was started, on the live Chainlink rounds. Nothing is stored but the
 * rule and the start time: the log is recomputed from chain data on every refresh, so the same inputs always give the same decisions
 * (and anyone can replay them).
 */
export function Paper() {
  const [agents, setAgents] = useState<PaperAgent[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const now = useNow(1000);
  useEffect(
    () =>
      afterMount(() => {
        const a = loadAgents();
        setAgents(a);
        setSel(a[0]?.id ?? null);
      }),
    [],
  );
  const agent = agents.find((a) => a.id === sel) ?? null;

  const startDemo = () => {
    const m = MARKETS[0];
    const a = addAgent(paramsToForm(PRESETS[2].build(m.feed, 0n), m.id, `${PRESETS[2].name} on ${m.id}`));
    setAgents(loadAgents());
    setSel(a.id);
  };
  const remove = (id: string) => {
    const next = agents.filter((a) => a.id !== id);
    saveAgents(next);
    setAgents(next);
    setSel(next[0]?.id ?? null);
  };

  return (
    <div className="wrap grid gap-6 py-10" data-testid="paper">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Paper agents">
        {agents.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={a.id === sel} onClick={() => setSel(a.id)} className={`btn sm normal-case ${a.id === sel ? "btn-orange" : "btn-line"}`}>
            {a.form.name || "Untitled"} · {a.form.market}
          </button>
        ))}
        <Link href="/studio" className="btn btn-white sm">
          New rule
        </Link>
      </div>
      {!agent ? (
        <section className="panel" data-testid="paper-empty">
          <div className="panel-b grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <h2 className="h3">No paper agent yet.</h2>
              <p className="copy mt-2">Write a rule in the studio and press “Run it on paper”, or start the momentum example on ETH/USD. It begins with the next bar close; nothing is traded.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-orange" onClick={startDemo} data-testid="paper-demo">
                Start the example <Arrow />
              </button>
              <Link href="/studio" className="btn btn-white">
                Open the studio
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <AgentView key={agent.id} agent={agent} now={now} onRemove={() => remove(agent.id)} />
      )}
    </div>
  );
}

function AgentView({ agent, now, onRemove }: { agent: PaperAgent; now: number; onRemove: () => void }) {
  const params = useMemo(() => formToParams(agent.form), [agent.form]);
  const { data: hist, error } = useHistory(agent.form.market, 60_000);
  const { data: latest } = useLatest(30_000);
  const live = latest?.rows.find((r) => r.id === agent.form.market);
  const livePrice = live && !("error" in live) ? BigInt(live.answer) : null;
  const nextBar = (Math.floor((now - SETTLE) / params.interval) + 1) * params.interval;
  const settledEnd = now - SETTLE;
  // recompute on every new round set or once a new bar settles
  const barKey = Math.floor(settledEnd / params.interval);
  const run = useMemo(() => {
    if (!hist) return null;
    return backtest(params, hist.rounds, agent.startedAt, barKey * params.interval);
  }, [hist, params, agent.startedAt, barKey]);
  const preview = useMemo(() => {
    if (!hist) return null;
    const t = barKey * params.interval;
    const cl = closesAt(hist.rounds, t, params.interval, closesNeeded(params));
    if (!cl) return null;
    const closes = cl.map((c) => c.round.answer);
    const d = decide(params, initialState(params), closes, t, cl[0].age);
    return { t, d, closes, age: cl[0].age };
  }, [hist, params, barKey]);
  const state = run?.state ?? initialState(params);
  const mark = livePrice ?? (run?.steps.length ? run.steps[run.steps.length - 1].price : null);
  const eq = mark ? equity(state, mark) : state.cash;
  const left = nextBar + SETTLE - now;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      <section className="panel min-w-0">
        <div className="panel-h flex-wrap">
          <div className="min-w-0">
            <h2 className="h3 text-[19px]">{agent.form.name || "Untitled rule"}</h2>
            <p className="small mt-1">
              {agent.form.market} · {params.interval / 3600 >= 1 ? `${params.interval / 3600} h bars` : "bars"} · started {fmtBar(agent.startedAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status="Prototype" />
            <span className="badge badge-live">Paper</span>
          </div>
        </div>
        <div className="panel-b grid gap-5">
          {error ? <p className="note note-warn">{error}</p> : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="paper-stats">
            <div className="stat">
              <p className="k">Paper equity</p>
              <p className="v">{usd(micro(eq))}</p>
              <p className="mt-1 text-[11px] text-white/50">from {usd(micro(params.startCash), 0)}</p>
            </div>
            <div className="stat">
              <p className="k">Position</p>
              <p className="v">{state.inPosition ? "Long" : "Flat"}</p>
              <p className="mt-1 text-[11px] text-white/50">{state.inPosition ? `entry ${usdPrice(state.entryPrice)}` : "cash only"}</p>
            </div>
            <div className="stat">
              <p className="k">Decisions</p>
              <p className="v">{run?.steps.length ?? 0}</p>
              <p className="mt-1 text-[11px] text-white/50">{run ? `${run.entries} entr${run.entries === 1 ? "y" : "ies"}` : "loading"}</p>
            </div>
            <div className="stat" data-testid="next-bar">
              <p className="k">Next decision</p>
              <p className="v tabular-nums">{left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "now"}</p>
              <p className="mt-1 text-[11px] text-white/50">bar closes {fmtBar(nextBar).slice(11)}</p>
            </div>
          </div>
          {run && run.steps.length >= 2 ? <EquityChart steps={run.steps} startCash={params.startCash} feeBps={params.feeBps} height={200} testid="paper-equity" /> : null}
          {run && run.steps.length === 0 ? (
            <div className="note" data-testid="paper-waiting">
              <p className="font-semibold">Waiting for the first bar after the start to close.</p>
              {preview ? (
                <p className="mt-1">
                  Preview of the latest closed bar ({fmtBar(preview.t)}), before the start and not part of the record: {ACTION_LABEL[preview.d.action].toLowerCase()} — {explainDecision(params, preview.d.reason, preview.closes, preview.t, preview.age, null)}
                </p>
              ) : null}
            </div>
          ) : null}
          {run && run.steps.length ? <DecisionTable steps={run.steps} params={params} pageSize={15} testid="paper-log" /> : null}
          <p className="note">Paper trading on live prices. No funds and no orders: nothing leaves this page. Simulated results never guarantee profit and are not advice.</p>
        </div>
      </section>
      <aside className="grid content-start gap-4">
        <div className="panel">
          <div className="panel-h">
            <h3 className="font-serif text-[16px] font-semibold">Live price</h3>
            <LiveBadge label="Chainlink" />
          </div>
          <div className="panel-b">
            <p className="font-serif text-[30px] font-bold tabular-nums tracking-[-0.02em]" data-testid="live-price">
              {livePrice ? usdPrice(livePrice) : "—"}
            </p>
            <p className="src mt-1">
              {live && !("error" in live) ? `round ${(BigInt(live.roundId) & ((1n << 64n) - 1n)).toString()}, published ${fmtAge(now - live.updatedAt)} ago` : "reading the feed…"}
            </p>
          </div>
        </div>
        <div className="panel">
          <div className="panel-h">
            <h3 className="font-serif text-[16px] font-semibold">The rule</h3>
          </div>
          <div className="panel-b small grid gap-2">
            <p>
              <b className="text-white">In:</b> {describeCondition(params.entry, params.interval)}
            </p>
            <p>
              <b className="text-white">Out:</b> {describeCondition(params.exit, params.interval)}
            </p>
            <p>
              Size {pct(params.sizeBps)} of cash · fee {pct(params.feeBps)} · stop {params.stopBps ? pct(params.stopBps) : "off"} · take-profit {params.takeProfitBps ? pct(params.takeProfitBps) : "off"} · max {params.maxEntriesPerDay || "∞"} entries/day
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href="/log" className="btn btn-white sm">
                Commit to the log
              </Link>
              <button type="button" className="btn btn-line sm" onClick={onRemove} data-testid="paper-remove">
                Stop and remove
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
