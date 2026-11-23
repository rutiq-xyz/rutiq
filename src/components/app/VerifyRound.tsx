"use client";

import { useState } from "react";
import { encodeFunctionData, decodeFunctionResult } from "viem";
import { explorerAddress } from "@/config/brand";
import { rpcBatchLoose } from "@/lib/client";
import { FEED_ABI } from "@/lib/engine/abi";
import { aggRoundOf } from "@/lib/engine/bars";
import { fmtBar, usdPrice } from "@/lib/engine/explain";

type Result = { ok: boolean; lines: string[] };

/**
 * Re-reads a bar close on chain from the browser: getRoundData(round) and getRoundData(round + 1) on the feed, plus latestRoundData.
 * The close is proven when round.updatedAt <= bar end and the next round is after the bar end (or the round is still the latest).
 * This is the same test the decision log contract runs before it accepts a decision.
 */
export function VerifyRound({ feed, roundId, barEnd, answer, testid = "verify-round" }: { feed: string; roundId: bigint; barEnd: number; answer: bigint; testid?: string }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const run = async () => {
    setBusy(true);
    setRes(null);
    try {
      const call = (fn: "getRoundData" | "latestRoundData", args: readonly unknown[]) => ({
        method: "eth_call",
        params: [{ to: feed, data: encodeFunctionData({ abi: FEED_ABI, functionName: fn, args } as never) }, "latest"],
      });
      const [a, b, l] = await rpcBatchLoose([call("getRoundData", [roundId]), call("getRoundData", [roundId + 1n]), call("latestRoundData", [])]);
      const dec = (raw: unknown, fn: "getRoundData" | "latestRoundData") => {
        if (typeof raw !== "string" || raw.length < 10) return null;
        try {
          return decodeFunctionResult({ abi: FEED_ABI, functionName: fn, data: raw as `0x${string}` }) as readonly [bigint, bigint, bigint, bigint, bigint];
        } catch {
          return null;
        }
      };
      const r = dec(a, "getRoundData");
      const n = dec(b, "getRoundData");
      const latest = dec(l, "latestRoundData");
      const lines: string[] = [];
      let ok = true;
      if (!r) {
        ok = false;
        lines.push("The round could not be read from the feed.");
      } else {
        const upd = Number(r[3]);
        lines.push(`Round ${aggRoundOf(roundId)} answered ${usdPrice(r[1])} at ${fmtBar(upd)}.`);
        if (r[1] !== answer) {
          ok = false;
          lines.push(`That differs from the ${usdPrice(answer)} used here.`);
        }
        if (upd > barEnd) {
          ok = false;
          lines.push("It was published after the bar closed.");
        }
        if (n && Number(n[3]) > 0) {
          const nu = Number(n[3]);
          lines.push(`Next round published at ${fmtBar(nu)}${nu > barEnd ? ", after the bar close" : ", BEFORE the bar close"}.`);
          if (nu <= barEnd) ok = false;
        } else if (latest && latest[0] === roundId) {
          lines.push("No newer round exists: this is still the feed's latest answer.");
        } else {
          ok = false;
          lines.push("The next round could not be read.");
        }
      }
      setRes({ ok, lines });
    } catch {
      setRes({ ok: false, lines: ["The chain could not be reached. Try again in a minute."] });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-testid={testid}>
      <button type="button" className="btn btn-line sm" onClick={run} disabled={busy}>
        {busy ? "Reading the feed…" : "Re-read on chain"}
      </button>
      {res ? (
        <div className={`note mt-3 ${res.ok ? "" : "note-warn"}`} data-testid={`${testid}-result`}>
          <p className="font-semibold">{res.ok ? "Proven: this round is the close of the bar." : "Not proven."}</p>
          {res.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
          <p className="src mt-1">
            Feed{" "}
            <a href={explorerAddress(feed)} target="_blank" rel="noreferrer">
              {feed}
            </a>{" "}
            · read through this site&apos;s relay to the Robinhood Chain RPC
          </p>
        </div>
      ) : null}
    </div>
  );
}
