"use client";

import { useEffect, useState } from "react";
import { MARKETS, type Market } from "@/config/markets.generated";
import { sortedRounds, type Round } from "@/lib/engine/bars";
import { useJson } from "@/lib/useJson";

/* Browser access to the server's Chainlink data: latest round per market (polled) and full round history per market (cached). */

export type LatestRow = { id: string; roundId: string; answer: string; updatedAt: number } | { id: string; error: string };
export type LatestAnswer = { rows: LatestRow[]; readAt: number };

export function useLatest(every = 30_000) {
  return useJson<LatestAnswer>("/api/latest", every);
}

export type HistoryAnswer = {
  market: string;
  feed: string;
  phase: number;
  rounds: [number, string, number][];
  snapshotBlock: number;
  snapshotTakenAt: number;
  snapshotCount: number;
  latestRound: number | null;
  readAt: number;
  complete: boolean;
  problem?: string;
};

export type LoadedHistory = { meta: HistoryAnswer; rounds: Round[]; market: Market };

const cache = new Map<string, { at: number; value: LoadedHistory }>();

export async function loadHistory(id: string, maxAgeMs = 60_000): Promise<LoadedHistory> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.value;
  const res = await fetch(`/api/history?market=${encodeURIComponent(id)}`, { cache: "no-store" });
  const body = (await res.json().catch(() => null)) as (HistoryAnswer & { error?: string }) | null;
  if (!res.ok || !body || !Array.isArray(body.rounds)) throw new Error(body?.error ?? `History request failed (${res.status}).`);
  const phase = BigInt(body.phase);
  const rounds = sortedRounds(body.rounds.map(([r, a, u]) => ({ id: (phase << 64n) | BigInt(r), answer: BigInt(a), updatedAt: u })));
  const market = MARKETS.find((m) => m.id === id);
  if (!market) throw new Error("Unknown market.");
  const value = { meta: body, rounds, market };
  cache.set(id, { at: Date.now(), value });
  return value;
}

export function useHistory(id: string | null, refreshMs = 0) {
  const [data, setData] = useState<LoadedHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!id) return;
    let dead = false;
    const start = setTimeout(() => !dead && setLoading(true), 0);
    loadHistory(id, refreshMs || 60_000)
      .then((v) => {
        if (!dead) {
          setData(v);
          setError(null);
        }
      })
      .catch((e: unknown) => !dead && setError(e instanceof Error ? e.message : "Could not load the price history."))
      .finally(() => !dead && setLoading(false));
    return () => {
      dead = true;
      clearTimeout(start);
    };
  }, [id, tick, refreshMs]);
  useEffect(() => {
    if (!refreshMs) return;
    const t = setInterval(() => document.visibilityState === "visible" && setTick((x) => x + 1), refreshMs);
    return () => clearInterval(t);
  }, [refreshMs]);
  return { data, error, loading, reload: () => setTick((x) => x + 1) };
}

export const marketLabel = (m: Market) => (m.kind === "stock" ? `${m.id} · ${m.label}` : `${m.id} · Ether`);
