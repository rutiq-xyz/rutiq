"use client";

import { storageKey } from "@/config/storage";
import { parseForm, type RuleForm } from "@/lib/engine/form";

/* Browser-only storage for the studio draft and paper agents. Every read is validated; damaged values are ignored, never fatal. */

const DRAFT = storageKey("draft");
const AGENTS = storageKey("agents");

export type PaperAgent = {
  id: string;
  form: RuleForm;
  /** unix seconds: the agent only decides on bars that close after this */
  startedAt: number;
};

function get(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function put(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // storage blocked or full: the page keeps working in memory
  }
}

export const loadDraft = (): RuleForm | null => parseForm(get(DRAFT));
export const saveDraft = (f: RuleForm) => put(DRAFT, f);

export function loadAgents(): PaperAgent[] {
  const raw = get(AGENTS);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a: PaperAgent) => {
      const form = parseForm(a?.form);
      return form && typeof a.id === "string" && Number.isFinite(a.startedAt) ? { id: a.id.slice(0, 40), form, startedAt: a.startedAt } : null;
    })
    .filter((a): a is PaperAgent => a !== null)
    .slice(0, 8);
}
export const saveAgents = (list: PaperAgent[]) => put(AGENTS, list.slice(0, 8));

export function addAgent(form: RuleForm): PaperAgent {
  const a: PaperAgent = { id: `a${Date.now().toString(36)}`, form, startedAt: Math.floor(Date.now() / 1000) };
  saveAgents([a, ...loadAgents()]);
  return a;
}
