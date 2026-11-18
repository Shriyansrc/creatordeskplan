import type { DeskState } from "./store";
import type { ScriptResult } from "@/lib/ai/contracts";
import type { ScriptReference } from "@/lib/reference-analysis/contracts";

export function draftTopicId(key: string): string {
  return key.split("@ref")[0] ?? key;
}

export function appendReferenceDraft(scripts: DeskState["scripts"], topicId: string, topicTitle: string, data: ScriptResult, reference: ScriptReference): DeskState["scripts"] {
  let key: string;
  do { key = `${topicId}@ref:${crypto.randomUUID()}`; } while (scripts[key]);
  return { ...scripts, [key]: { data, at: new Date().toISOString(), reference, topicTitle } };
}

export function draftLabel(key: string, scripts: DeskState["scripts"], topics: { id: string; title: string }[] = []): string {
  const draft = scripts[key];
  const title = draft?.topicTitle ?? topics.find((t) => t.id === draftTopicId(key))?.title ?? draft?.data.title ?? "Saved script";
  if (!draft?.reference && !key.includes("@ref")) return title;
  const siblings = Object.keys(scripts).filter((k) => draftTopicId(k) === draftTopicId(key) && (scripts[k]?.reference || k.includes("@ref")));
  return `${title} — Reference draft ${siblings.indexOf(key) + 1}`;
}