"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { encodeFunctionData, type Abi } from "viem";
import { CHAIN, explorerAddress, explorerTx } from "@/config/brand";
import { CONTRACTS, logLive } from "@/config/contracts";
import { MARKETS } from "@/config/markets.generated";
import { loadAgents, type PaperAgent } from "@/components/app/store";
import { StatusBadge } from "@/components/site/PageHead";
import { useHistory } from "@/components/live/data";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { explain, read, simulate, waitForReceipt } from "@/lib/client";
import { DECISION_LOG_ABI, paramsHash, paramsStruct, specHash } from "@/lib/engine/abi";
import { aggRoundOf, closesAt } from "@/lib/engine/bars";
import { ACTION_LABEL, REASON_LABEL, fmtBar, micro, usd, usdPrice } from "@/lib/engine/explain";
import { formToParams } from "@/lib/engine/form";
import { afterMount, useNow } from "@/lib/useNow";
import { useJson } from "@/lib/useJson";
import { closesNeeded, decide, initialState, type Action, type PaperState, type Reason } from "@/lib/engine/rules";

const ABI = DECISION_LOG_ABI as unknown as Abi;
const SETTLE = 120;

type OnChainDecision = { barEnd: bigint; roundId: bigint; price: bigint; action: number; reason: number; gapBars: number; l2Block: bigint; cashAfter: bigint; unitsAfter: bigint };
type RuleSetRead = readonly [
  { owner: string; registeredAt: bigint; retired: boolean; specHash: string; paramsHash: string },
  unknown,
  { cash: bigint; units: bigint; feesPaid: bigint; entryPrice: bigint; lastBar: bigint; entryDay: number; entriesToday: number; inPosition: boolean; decisions: number },
];

/*
 * The on-chain decision log. Before the owner deploys RutiqDecisionLog this page shows exactly what a commit would send (the rule's
 * parameters and hash, the next bar's round ids, action and reason) so it can be checked by hand; after deployment it registers a paper
 * agent's rule and commits its decisions bar by bar. The contract re-reads the rounds and refuses any decision the rule would not make.
 */
export function LogView() {
  const live = logLive();
  const [agents, setAgents] = useState<PaperAgent[]>([]);
  const [sel, setSel] = useState<string | null>(null);
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

  return (
    <div className="wrap grid gap-6 py-10" data-testid="log">
      <section className="panel" id="contract">
        <div className="panel-h flex-wrap">
          <h2 className="h3 text-[19px]">RutiqDecisionLog</h2>
          <div className="flex items-center gap-2">
            <StatusBadge status="Prototype" />
            <span className={`badge ${live ? "badge-live" : "badge-concept"}`} data-testid="log-status">
              {live ? "Deployed" : "Not deployed yet"}
            </span>
          </div>
        </div>
        <div className="panel-b grid gap-3 lg:grid-cols-2">
          <div className="copy grid gap-2">
            <p>A public log of paper decisions on {CHAIN.name}. A wallet registers a rule; for each bar it may commit the decision with the Chainlink round ids of the closes it used.</p>
            <p>
              The contract re-reads every round, checks that each one is the close of its bar (published before the bar ended, and the next round after it), recomputes the rule with the same
              integer math as this site and accepts only the decision the rule really makes. The paper account (cash, units, fees) is updated on chain.
            </p>
            <p className="small">No funds, no tokens, no orders, no owner, no fee, no upgrade. Bars before registration cannot be committed; skipped bars are counted on chain, so a gap-free log is visible as one.</p>
          </div>
          <div className="small grid content-start gap-2">
            {live ? (
              <p>
                Address{" "}
                <a className="text-[#ffb183] underline" href={explorerAddress(CONTRACTS.decisionLog)} target="_blank" rel="noreferrer">
                  {CONTRACTS.decisionLog}
                </a>
                {CONTRACTS.tx ? (
                  <>
                    {" "}
                    · deployed in{" "}
                    <a className="text-[#ffb183] underline" href={explorerTx(CONTRACTS.tx)} target="_blank" rel="noreferrer">
                      this transaction
                    </a>
                  </>
                ) : null}
              </p>
            ) : (
              <p className="note">The contract is written and tested (unit, parity with this site&apos;s engine on 991 bars, invariants, Robinhood Chain fork) but not deployed yet. Until it is, this page shows the exact call a commit would make.</p>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Paper agents">
        {agents.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={a.id === sel} onClick={() => setSel(a.id)} className={`btn sm normal-case ${a.id === sel ? "btn-orange" : "btn-line"}`}>
            {a.form.name || "Untitled"} · {a.form.market}
          </button>
        ))}
      </div>
      {agent ? (
        <AgentLog key={agent.id} agent={agent} live={live} />
      ) : (
        <section className="panel">
          <div className="panel-b">
            <p className="copy">
              No paper agent in this browser yet. <Link href="/studio" className="text-[#ffb183] underline">Write a rule</Link> and run it on paper first; its decisions are what gets committed.
            </p>
          </div>
        </section>
      )}
      {live ? <Lookup /> : null}
    </div>
  );
}

function AgentLog({ agent, live }: { agent: PaperAgent; live: boolean }) {
  const params = useMemo(() => formToParams(agent.form), [agent.form]);
  const { data: hist } = useHistory(agent.form.market, 60_000);
  const { address, chainId, sendTransaction, switchNetwork } = useWallet();
  const { open } = useWalletModal();
  const [mine, setMine] = useState<{ id: bigint; info: RuleSetRead } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);
  const ph = paramsHash(params);
  // The contract judges bars by block.timestamp, so the next bar is picked by the chain's clock when it is known.
  const browserNow = useNow(30_000);
  const { data: chain } = useJson<{ time: number | null }>("/api/chain", 20_000);
  const now = chain?.time ? Math.max(chain.time, browserNow - 600) : browserNow;
  const spec = useMemo(() => ({ app: "rutiq", v: 1, name: agent.form.name, market: agent.form.market }), [agent.form]);

  const refresh = useCallback(async () => {
    if (!live || !address) return setMine(null);
    try {
      const ids = await read<readonly bigint[]>({ to: CONTRACTS.decisionLog, abi: ABI, fn: "ruleSetsOf", args: [address] });
      for (const id of [...ids].reverse()) {
        const info = await read<RuleSetRead>({ to: CONTRACTS.decisionLog, abi: ABI, fn: "ruleSet", args: [id] });
        if (info[0].paramsHash.toLowerCase() === ph.toLowerCase() && !info[0].retired) return setMine({ id, info });
      }
      setMine(null);
    } catch {
      setMine(null);
    }
  }, [live, address, ph]);
  useEffect(() => afterMount(() => void refresh()), [refresh]);

  // The next bar to commit, decided from the contract's own paper state (so a log with skipped bars still gets the decision the
  // contract will compute), with the same closes the contract will prove.
  const next = useMemo(() => {
    if (!hist) return null;
    const regAt = mine ? Number(mine.info[0].registeredAt) : now - params.interval;
    const lastBar = mine ? Number(mine.info[2].lastBar) : 0;
    const end = Math.floor((now - SETTLE) / params.interval) * params.interval;
    const t = Math.max(Math.ceil(regAt / params.interval) * params.interval, lastBar + params.interval);
    if (t > end) return null;
    const cl = closesAt(hist.rounds, t, params.interval, closesNeeded(params));
    if (!cl) return null;
    const c = mine?.info[2];
    const state: PaperState = c
      ? { cash: c.cash, units: c.units, feesPaid: c.feesPaid, entryPrice: c.entryPrice, lastBar: Number(c.lastBar), entryDay: Number(c.entryDay), entriesToday: Number(c.entriesToday), inPosition: c.inPosition, decisions: Number(c.decisions) }
      : initialState(params);
    const closes = cl.map((x) => x.round.answer);
    const d = decide(params, state, closes, t, cl[0].age);
    return { barEnd: t, price: closes[0], roundIds: cl.map((x) => x.round.id), action: d.action, reason: d.reason };
  }, [hist, params, mine, now]);

  const wrongNet = address && chainId !== CHAIN.id;
  const send = async (label: string, data: `0x${string}`) => {
    if (!address) return open();
    if (wrongNet) return switchNetwork();
    setBusy(label);
    setMsg(null);
    try {
      await simulate(address, CONTRACTS.decisionLog, data);
      const tx = await sendTransaction({ to: CONTRACTS.decisionLog, data });
      const r = await waitForReceipt(tx);
      setMsg({ ok: r.ok, text: r.ok ? `${label}: confirmed in block ${r.blockNumber}.` : `${label}: the transaction failed.`, tx });
      await refresh();
    } catch (e) {
      setMsg({ ok: false, text: explain(e) });
    } finally {
      setBusy(null);
    }
  };

  const registerData = encodeFunctionData({ abi: ABI, functionName: "register", args: [paramsStruct(params), specHash(spec)] });
  const commitData =
    mine && next
      ? encodeFunctionData({ abi: ABI, functionName: "commit", args: [mine.id, BigInt(next.barEnd), next.roundIds, next.action, next.reason] })
      : null;

  return (
    <section className="panel" data-testid="agent-log">
      <div className="panel-h flex-wrap">
        <h2 className="h3 text-[19px]">{agent.form.name || "Untitled rule"}</h2>
        <span className="small">paramsHash {ph.slice(0, 18)}…</span>
      </div>
      <div className="panel-b grid gap-5">
        <div className="grid gap-3 md:grid-cols-3">
          <Step n="1" title="Register the rule" done={Boolean(mine)}>
            {mine ? <p>Registered as rule set #{mine.id.toString()} at {fmtBar(Number(mine.info[0].registeredAt))}.</p> : <p>Stores the rule&apos;s parameters and starts a paper account on chain. One transaction, gas in ETH.</p>}
            {live && !mine ? (
              <button type="button" className="btn btn-orange sm mt-3" disabled={busy !== null} onClick={() => send("Register", registerData)} data-testid="register">
                {busy === "Register" ? "Waiting for the wallet…" : address ? (wrongNet ? `Switch to ${CHAIN.name}` : "Register") : "Connect wallet"}
              </button>
            ) : null}
          </Step>
          <Step n="2" title="Commit the next bar" done={false}>
            {next ? (
              <p>
                {fmtBar(next.barEnd)}: <b>{ACTION_LABEL[next.action as Action]}</b> ({REASON_LABEL[next.reason as Reason]}) at {usdPrice(next.price)}, rounds{" "}
                {next.roundIds
                  .slice(0, 4)
                  .map((r) => aggRoundOf(r).toString())
                  .join(", ")}
                {next.roundIds.length > 4 ? ` … (${next.roundIds.length})` : ""}.
              </p>
            ) : (
              <p>{hist ? "No settled bar after the registration yet. Bars settle two minutes after they close." : "Loading the price history…"}</p>
            )}
            {live && mine && commitData ? (
              <button type="button" className="btn btn-orange sm mt-3" disabled={busy !== null} onClick={() => send("Commit", commitData)} data-testid="commit">
                {busy === "Commit" ? "Waiting for the wallet…" : "Commit"}
              </button>
            ) : null}
          </Step>
          <Step n="3" title="Anyone can check it" done={false}>
            <p>The contract refuses a decision the rule would not make, so every row in the log below was re-checked on chain at the time it was added.</p>
          </Step>
        </div>
        {msg ? (
          <p className={`note ${msg.ok ? "" : "note-warn"}`} data-testid="log-msg">
            {msg.text}{" "}
            {msg.tx ? (
              <a className="underline" href={explorerTx(msg.tx)} target="_blank" rel="noreferrer">
                View transaction
              </a>
            ) : null}
          </p>
        ) : null}
        {!live ? (
          <details className="rounded-xl border border-line p-4" data-testid="call-preview">
            <summary className="cursor-pointer text-[14px] font-semibold">The exact calls (for checking by hand)</summary>
            <p className="small mt-3">register(params, specHash) call data:</p>
            <pre className="mono mt-1 max-h-40 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] break-all whitespace-pre-wrap">{registerData}</pre>
            {next ? (
              <>
                <p className="small mt-3">commit(id, barEnd, roundIds, action, reason) arguments for the next bar:</p>
                <pre className="mono mt-1 max-h-40 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] break-all whitespace-pre-wrap">
                  {JSON.stringify({ barEnd: next.barEnd, roundIds: next.roundIds.map(String), action: next.action, reason: next.reason }, null, 1)}
                </pre>
              </>
            ) : null}
          </details>
        ) : null}
        {live && mine ? <Decisions id={mine.id} version={Number(mine.info[2].decisions)} /> : null}
      </div>
    </section>
  );
}

function Step({ n, title, done, children }: { n: string; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-black/20 p-4">
      <p className="text-[12px] text-white/50">{`0${n}`}</p>
      <h3 className="mt-1 font-serif text-[17px] font-semibold">
        {title} {done ? <span className="text-[var(--good)]">✓</span> : null}
      </h3>
      <div className="small mt-2">{children}</div>
    </div>
  );
}

function Decisions({ id, version = 0 }: { id: bigint; version?: number }) {
  const [rows, setRows] = useState<OnChainDecision[] | null>(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const n = await read<bigint>({ to: CONTRACTS.decisionLog, abi: ABI, fn: "decisionCount", args: [id] });
        const from = n > 50n ? n - 50n : 0n;
        const d = await read<readonly OnChainDecision[]>({ to: CONTRACTS.decisionLog, abi: ABI, fn: "decisions", args: [id, from, 50n] });
        if (!dead) setRows([...d].reverse());
      } catch {
        if (!dead) setRows([]);
      }
    })();
    return () => {
      dead = true;
    };
  }, [id, version]);
  if (!rows) return <p className="small">Reading the log…</p>;
  if (!rows.length) return <p className="small">No decisions committed yet.</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-line" data-testid="onchain-decisions">
      <table className="tbl">
        <thead>
          <tr>
            <th className="w-[34%]">Bar close</th>
            <th className="w-[22%]">Action</th>
            <th className="w-[44%] text-right">Price · cash after</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.barEnd)}>
              <td className="tabular-nums">
                {fmtBar(Number(r.barEnd)).replace(" UTC", "")}
                <span className="block text-[11px] text-white/45">
                  round {aggRoundOf(r.roundId).toString()}
                  {r.gapBars ? ` · ${r.gapBars} bar${r.gapBars === 1 ? "" : "s"} skipped before` : ""}
                </span>
              </td>
              <td>
                <span className={`act act-${r.action}`}>{ACTION_LABEL[r.action as Action].toUpperCase()}</span>
                <span className="mt-1 block text-[11px] text-white/50">{REASON_LABEL[r.reason as Reason]}</span>
              </td>
              <td className="text-right tabular-nums">
                {usdPrice(r.price)}
                <span className="block text-[11px] text-white/50">{usd(micro(r.cashAfter))}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Lookup() {
  const [id, setId] = useState("");
  const [shown, setShown] = useState<bigint | null>(null);
  return (
    <section className="panel">
      <div className="panel-h">
        <h2 className="h3 text-[19px]">Look up any rule set</h2>
      </div>
      <div className="panel-b grid gap-4">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d{1,9}$/.test(id)) setShown(BigInt(id));
          }}
        >
          <input className="input max-w-[200px]" inputMode="numeric" placeholder="Rule set number" value={id} onChange={(e) => setId(e.target.value)} />
          <button className="btn btn-white" type="submit">
            Read the log
          </button>
        </form>
        {shown !== null ? <Decisions key={String(shown)} id={shown} /> : null}
        <p className="small">Feeds a rule can use here: {MARKETS.map((m) => m.feedDescription).join(", ")}.</p>
      </div>
    </section>
  );
}
