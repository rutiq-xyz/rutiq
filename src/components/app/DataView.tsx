"use client";

import { useMemo, useState } from "react";
import { CHAIN, explorerAddress, explorerToken } from "@/config/brand";
import { MARKETS, MARKETS_RESOLVED_AT } from "@/config/markets.generated";
import { VerifyRound } from "@/components/app/VerifyRound";
import { LiveBadge } from "@/components/site/PageHead";
import { useHistory, useLatest } from "@/components/live/data";
import { useJson } from "@/lib/useJson";
import { useNow } from "@/lib/useNow";
import { aggRoundOf, roundIndexAt } from "@/lib/engine/bars";
import { fmtAge, fmtBar, usdPrice } from "@/lib/engine/explain";

type Chain = { block: number | null; time: number | null; gasPriceWei: string | null; readAt: number };

export function DataView() {
  const { data: latest, error } = useLatest(30_000);
  const { data: chain } = useJson<Chain>("/api/chain", 30_000);
  const now = useNow(15_000);
  return (
    <div className="wrap grid gap-6 py-10" data-testid="data">
      <section className="panel" id="feeds">
        <div className="panel-h flex-wrap">
          <h2 className="h3 text-[19px]">Markets and their price feeds</h2>
          <LiveBadge />
        </div>
        <div className="panel-b grid gap-4">
          {error ? <p className="note note-warn">{error}</p> : null}
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="tbl" data-testid="markets-table">
              <thead>
                <tr>
                  <th className="w-[26%] sm:w-[22%]">Market</th>
                  <th className="hidden sm:table-cell sm:w-[34%]">Feed · token on {CHAIN.name}</th>
                  <th className="w-[38%] text-right sm:w-[22%]">Latest price</th>
                  <th className="w-[36%] text-right sm:w-[22%]">Published</th>
                </tr>
              </thead>
              <tbody>
                {MARKETS.map((m) => {
                  const r = latest?.rows.find((x) => x.id === m.id);
                  const ok = r && !("error" in r);
                  const age = ok ? now - r.updatedAt : null;
                  return (
                    <tr key={m.id} data-testid={`market-${m.id}`}>
                      <td>
                        <b className="font-serif">{m.id}</b>
                        <span className="block text-[11px] text-white/50">{m.kind === "stock" ? `${m.label} stock token` : "Ether (WETH on chain)"}</span>
                      </td>
                      <td className="hidden sm:table-cell">
                        <a className="text-[#ffb183] underline" href={explorerAddress(m.feed)} target="_blank" rel="noreferrer">
                          {m.feedDescription}
                        </a>
                        <span className="block text-[11px] text-white/50">
                          token{" "}
                          <a className="underline" href={explorerToken(m.token)} target="_blank" rel="noreferrer">
                            {m.token.slice(0, 10)}…{m.token.slice(-6)}
                          </a>
                          {m.kind === "stock" ? " · proven: proxy code, beacon, supply, symbol" : ""}
                        </span>
                      </td>
                      <td className="text-right tabular-nums">
                        {ok ? usdPrice(BigInt(r.answer)) : "—"}
                        <span className="block text-[11px] text-white/50">{ok ? `round ${aggRoundOf(BigInt(r.roundId)).toString()}` : "reading…"}</span>
                      </td>
                      <td className="text-right tabular-nums">
                        {age !== null ? `${fmtAge(age)} ago` : "—"}
                        <span className="block text-[11px] text-white/50">{age !== null && age > 6 * 3600 ? (m.kind === "stock" ? "quiet: US session closed?" : "quiet feed") : age !== null ? "fresh" : ""}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small">
            Every price on this site is a Chainlink round read from {CHAIN.name}: the feed publishes a new round when the price moves past its threshold (0.5 %) or after its heartbeat (24 h). Stock feeds
            follow the US session (Sunday 20:00 to Friday 20:00 New York time) and go quiet outside it. Stock tokens are tokens on {CHAIN.name} that track a share price; they are not the shares
            themselves, and {`this site is not affiliated with Robinhood`}. Market list proven on chain at block {MARKETS_RESOLVED_AT.toLocaleString("en-US")}.
          </p>
          {chain?.block ? (
            <p className="src">
              Chain head {chain.block.toLocaleString("en-US")}
              {chain.gasPriceWei ? ` · gas ${(Number(chain.gasPriceWei) / 1e9).toFixed(4)} gwei` : ""} · read {fmtAge(now - Math.floor(chain.readAt / 1000))} ago
            </p>
          ) : null}
        </div>
      </section>
      <BarCheck />
    </div>
  );
}

function BarCheck() {
  const [market, setMarket] = useState(MARKETS[0].id);
  const [when, setWhen] = useState(() => new Date(Math.floor(Date.now() / 3_600_000 - 24) * 3_600_000).toISOString().slice(0, 16));
  const { data: hist, loading } = useHistory(market);
  const bar = useMemo(() => {
    const t = Math.floor(Date.parse(`${when}:00Z`) / 1000);
    if (!Number.isFinite(t) || !hist) return null;
    const k = roundIndexAt(hist.rounds, t);
    return { t, round: k >= 0 ? hist.rounds[k] : null, next: k >= 0 && k + 1 < hist.rounds.length ? hist.rounds[k + 1] : null };
  }, [when, hist]);
  const m = MARKETS.find((x) => x.id === market)!;
  return (
    <section className="panel" data-testid="bar-check">
      <div className="panel-h">
        <h2 className="h3 text-[19px]">Check one close yourself</h2>
      </div>
      <div className="panel-b grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="grid content-start gap-3">
          <label className="block">
            <span className="label">Market</span>
            <select className="select" value={market} onChange={(e) => setMarket(e.target.value)}>
              {MARKETS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.id}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Moment (UTC)</span>
            <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} data-testid="bar-when" />
          </label>
          <p className="small">The close at a moment is the latest round published at or before it. History: {hist ? `${hist.rounds.length.toLocaleString("en-US")} rounds since ${fmtBar(hist.rounds[0].updatedAt).slice(0, 10)}` : loading ? "loading…" : "—"}.</p>
        </div>
        <div className="grid content-start gap-3">
          {bar?.round ? (
            <>
              <p className="copy">
                {m.feedDescription} at {fmtBar(bar.t)}: <b className="text-white">{usdPrice(bar.round.answer)}</b> from round {aggRoundOf(bar.round.id).toString()}, published {fmtAge(bar.t - bar.round.updatedAt)} earlier
                {bar.next ? `; the next round came ${fmtAge(bar.next.updatedAt - bar.t)} later.` : "; no newer round yet."}
              </p>
              <VerifyRound feed={m.feed} roundId={bar.round.id} barEnd={bar.t} answer={bar.round.answer} testid="data-verify" />
            </>
          ) : (
            <p className="small">{hist ? "No round exists before that moment." : "Loading…"}</p>
          )}
        </div>
      </div>
    </section>
  );
}
