"use client";

import { MARKETS } from "@/config/markets.generated";
import { marketLabel } from "@/components/live/data";
import type { CondForm, RuleForm } from "@/lib/engine/form";
import { KIND, type Kind } from "@/lib/engine/rules";

/* The rule builder form. Every field maps 1:1 to a RutiqRuleMath.RuleParams field (src/lib/engine/form.ts). */

const KINDS: { kind: Kind; label: string; exitOnly?: boolean }[] = [
  { kind: KIND.SMA_CROSS_UP, label: "Short average crosses above long" },
  { kind: KIND.SMA_CROSS_DOWN, label: "Short average crosses below long" },
  { kind: KIND.ABOVE_SMA, label: "Close above its average" },
  { kind: KIND.BELOW_SMA, label: "Close below its average" },
  { kind: KIND.CHANGE_AT_LEAST, label: "Change over N bars ≥ x %" },
  { kind: KIND.CHANGE_AT_MOST, label: "Change over N bars ≤ x %" },
  { kind: KIND.PRICE_ABOVE, label: "Close above a price" },
  { kind: KIND.PRICE_BELOW, label: "Close below a price" },
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Num({ label, value, onChange, step = 1, min, max, suffix, testid }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string; testid?: string }) {
  return (
    <label className="block min-w-0">
      <span className="label">
        {label}
        {suffix ? <span className="font-normal text-white/45"> ({suffix})</span> : null}
      </span>
      <input className="input" type="number" inputMode="decimal" step={step} min={min} max={max} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} data-testid={testid} />
    </label>
  );
}

function CondEditor({ title, value, onChange, allowNone, testid }: { title: string; value: CondForm; onChange: (c: CondForm) => void; allowNone?: boolean; testid: string }) {
  const k = value.kind;
  const cross = k === KIND.SMA_CROSS_UP || k === KIND.SMA_CROSS_DOWN;
  const smaK = k === KIND.ABOVE_SMA || k === KIND.BELOW_SMA;
  const change = k === KIND.CHANGE_AT_LEAST || k === KIND.CHANGE_AT_MOST;
  const price = k === KIND.PRICE_ABOVE || k === KIND.PRICE_BELOW;
  const setKind = (kind: Kind) => {
    const n: CondForm = { kind, a: value.a || 6, b: value.b || 24, value: value.value };
    if (kind === KIND.SMA_CROSS_UP || kind === KIND.SMA_CROSS_DOWN) {
      n.a = Math.min(value.a || 6, 47);
      n.b = Math.max(value.b || 24, n.a + 1);
    }
    if (kind === KIND.ABOVE_SMA || kind === KIND.BELOW_SMA) n.a = Math.max(2, value.a || 12);
    if (kind === KIND.CHANGE_AT_LEAST || kind === KIND.CHANGE_AT_MOST) n.value = /^-?\d+(\.\d+)?$/.test(value.value) && Math.abs(Number(value.value)) < 100 ? value.value : kind === KIND.CHANGE_AT_MOST ? "-2" : "2";
    if (kind === KIND.PRICE_ABOVE || kind === KIND.PRICE_BELOW) n.value = /^\d/.test(value.value) && Number(value.value) >= 100 ? value.value : "";
    onChange(n);
  };
  return (
    <fieldset className="min-w-0" data-testid={testid}>
      <legend className="label">{title}</legend>
      <select className="select" value={k} onChange={(e) => setKind(Number(e.target.value) as Kind)} data-testid={`${testid}-kind`}>
        {allowNone ? <option value={KIND.NONE}>No exit rule (stop / take-profit only)</option> : null}
        {KINDS.map((o) => (
          <option key={o.kind} value={o.kind}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {cross ? (
          <>
            <Num label="Short average" suffix="bars" value={value.a} min={1} max={47} onChange={(a) => onChange({ ...value, a })} testid={`${testid}-a`} />
            <Num label="Long average" suffix="bars" value={value.b} min={2} max={48} onChange={(b) => onChange({ ...value, b })} testid={`${testid}-b`} />
          </>
        ) : null}
        {smaK ? <Num label="Average length" suffix="bars" value={value.a} min={2} max={48} onChange={(a) => onChange({ ...value, a })} testid={`${testid}-a`} /> : null}
        {change ? (
          <>
            <Num label="Look-back" suffix="bars" value={value.a} min={1} max={48} onChange={(a) => onChange({ ...value, a })} testid={`${testid}-a`} />
            <label className="block min-w-0">
              <span className="label">Change ({k === KIND.CHANGE_AT_LEAST ? "at least" : "at most"}, %)</span>
              <input className="input" inputMode="decimal" value={value.value} onChange={(e) => onChange({ ...value, value: e.target.value })} data-testid={`${testid}-value`} />
            </label>
          </>
        ) : null}
        {price ? (
          <label className="col-span-2 block min-w-0">
            <span className="label">Price level (USD, feed price)</span>
            <input className="input" inputMode="decimal" placeholder="e.g. 1700" value={value.value} onChange={(e) => onChange({ ...value, value: e.target.value })} data-testid={`${testid}-value`} />
          </label>
        ) : null}
      </div>
    </fieldset>
  );
}

export function RuleEditor({ form, onChange }: { form: RuleForm; onChange: (f: RuleForm) => void }) {
  const set = <K extends keyof RuleForm>(k: K, v: RuleForm[K]) => onChange({ ...form, [k]: v });
  const toggleHour = (h: number) => set("hoursMask", form.hoursMask ^ (1 << h));
  const toggleDay = (d: number) => set("daysMask", form.daysMask ^ (1 << d));
  return (
    <div className="grid gap-6" data-testid="rule-editor">
      <div className="grid gap-3">
        <label className="block min-w-0">
          <span className="label">Market (Chainlink feed)</span>
          <select
            className="select"
            value={form.market}
            onChange={(e) => {
              const m = MARKETS.find((x) => x.id === e.target.value);
              if (m) onChange({ ...form, market: m.id, feed: m.feed });
            }}
            data-testid="market"
          >
            {MARKETS.map((m) => (
              <option key={m.id} value={m.id}>
                {marketLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <div className="min-w-0">
          <span className="label">Bar length</span>
          <div className="seg" role="group" aria-label="Bar length">
            {[
              [3600, "1 hour"],
              [14_400, "4 hours"],
              [86_400, "1 day"],
            ].map(([v, l]) => (
              <button key={v} type="button" aria-pressed={form.interval === v} onClick={() => set("interval", Number(v))}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
      <CondEditor title="Entry: buy when" value={form.entry} onChange={(c) => set("entry", c)} testid="entry" />
      <CondEditor title="Exit: sell when" value={form.exit} onChange={(c) => set("exit", c)} allowNone testid="exit" />
      <div className="grid grid-cols-2 gap-3">
        <Num label="Size per entry" suffix="% of cash" value={form.sizePct} step={5} min={0.01} max={100} onChange={(v) => set("sizePct", v)} testid="size" />
        <Num label="Stop-loss" suffix="%, 0 = off" value={form.stopPct} step={0.5} min={0} max={99} onChange={(v) => set("stopPct", v)} testid="stop" />
        <Num label="Take-profit" suffix="%, 0 = off" value={form.takeProfitPct} step={0.5} min={0} max={1000} onChange={(v) => set("takeProfitPct", v)} testid="tp" />
        <Num label="Max entries a day" suffix="0 = no limit" value={form.maxEntriesPerDay} min={0} max={24} onChange={(v) => set("maxEntriesPerDay", v)} testid="maxday" />
        <Num label="Fee + slippage" suffix="% per fill" value={form.feePct} step={0.05} min={0} max={10} onChange={(v) => set("feePct", v)} testid="fee" />
        <Num label="Ignore prices older than" suffix="hours" value={form.maxStaleHours} step={1} min={0.1} max={720} onChange={(v) => set("maxStaleHours", v)} testid="stale" />
      </div>
      <div>
        <span className="label">Schedule: act only on bars closing at these UTC hours / days</span>
        <div className="flex flex-wrap gap-1" role="group" aria-label="UTC hours">
          {Array.from({ length: 24 }, (_, h) => (
            <button key={h} type="button" aria-pressed={((form.hoursMask >> h) & 1) === 1} onClick={() => toggleHour(h)} className={`h-7 w-9 rounded-md border text-[11px] tabular-nums ${((form.hoursMask >> h) & 1) === 1 ? "border-[var(--orange)] bg-[rgba(255,106,19,.16)] text-white" : "border-line text-white/45"}`}>
              {String(h).padStart(2, "0")}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="UTC weekdays">
          {DAYS.map((d, i) => (
            <button key={d} type="button" aria-pressed={((form.daysMask >> i) & 1) === 1} onClick={() => toggleDay(i)} className={`h-7 rounded-md border px-2.5 text-[12px] ${((form.daysMask >> i) & 1) === 1 ? "border-[var(--orange)] bg-[rgba(255,106,19,.16)] text-white" : "border-line text-white/45"}`}>
              {d}
            </button>
          ))}
          <button type="button" className="ml-auto h-7 rounded-md border border-line px-2.5 text-[12px] text-white/70" onClick={() => onChange({ ...form, hoursMask: 0xffffff, daysMask: 0x7f })}>
            Any time
          </button>
        </div>
      </div>
      <Num label="Starting paper cash" suffix="USD" value={form.startCash} step={1000} min={1} onChange={(v) => set("startCash", v)} testid="cash" />
    </div>
  );
}
