import { z } from "zod";

/** Browser-safe contracts for automatic reference-video analysis. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_UPLOAD_SECONDS = 180;
export const UPLOAD_MIME = ["video/mp4", "video/quicktime", "video/webm"] as const;

export const contextSchema = z.object({
  topic: z.string().trim().max(300).default(""),
  niche: z.string().trim().max(300).default(""),
  goal: z.string().trim().max(300).default(""),
  audience: z.string().trim().max(500).default(""),
  language: z.string().trim().max(40).default(""),
});
export type AnalysisContext = z.infer<typeof contextSchema>;

const s = (n: number) => z.string().trim().max(n);
// Model output is normalised, not rejected, for harmless shape slips: long text is cut, a single string becomes a list.
const t = (n: number) => z.preprocess((v) => (v == null ? "" : typeof v === "string" ? v.trim().slice(0, n) : String(v).slice(0, n)), z.string());
const list = <T extends z.ZodTypeAny>(item: T, max: number) => z.preprocess((v) => (v == null ? [] : Array.isArray(v) ? v.slice(0, max) : [v]), z.array(item));
/** What the model must return. Everything is observed content; nothing about metrics or identity. */
export const observedSchema = z.object({
  canSee: z.boolean(),
  speechHeard: z.boolean(),
  hook: t(500),
  spokenPoints: list(t(400), 12),
  onScreenText: list(z.object({ at: t(20), text: t(300) }), 20),
  structure: list(z.object({ start: t(20), end: t(20), beat: t(300) }), 15),
  visualPatterns: list(t(300), 10),
  pacing: t(400),
  durationSeconds: z.preprocess((v) => (typeof v === "number" && v >= 0 ? v : null), z.number().nullable()),
  topicFit: t(500),
  fitCaution: t(400),
  ideas: list(z.object({ title: t(200), angle: t(500) }), 5),
  scriptDirection: z.object({ hookPattern: t(400), beats: list(t(300), 8), notes: t(500) }),
  avoidCopying: list(t(300), 6),
});
export type Observed = z.infer<typeof observedSchema>;

export type Metric = { value: number | null; source: string; fetchedAt: string };
export type Metrics = { views: Metric; likes: Metric; comments: Metric; published: { value: string | null; source: string } };
export type AnalysisMode = "video+audio" | "video-only";
export type Provenance = { kind: "link" | "upload"; platform: "yt" | "ig" | "li" | "x" | "file"; url: string | null; fileName: string | null; title: string | null; creator: string | null };

export type ReferenceAnalysisResult = {
  status: "analysed";
  mode: AnalysisMode;
  evidence: string;
  provenance: Provenance;
  observed: Observed;
  metrics: Metrics;
  warning: string | null;
  analysedAt: string;
};
export type NeedsUpload = { status: "needs_upload"; platform: "ig" | "li" | "x"; reason: string; provenance: Provenance };

const SAFE_HOSTS: Record<string, "yt" | "ig" | "li" | "x"> = {
  "youtube.com": "yt", "youtu.be": "yt", "instagram.com": "ig", "linkedin.com": "li", "x.com": "x", "twitter.com": "x",
};
/** Only https links on known public video platforms. Everything else (private hosts, IPs, other sites) is rejected. */
export function platformOfLink(raw: string): "yt" | "ig" | "li" | "x" | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  return SAFE_HOSTS[host] ?? null;
}

export const unknownMetric = (source: string): Metric => ({ value: null, source, fetchedAt: "" });

/**
 * Extreme-case performance warning. Without a comparable baseline (e.g. the same creator's typical views)
 * performance is unknown, and missing metrics are never underperformance. A warning needs BOTH a valid
 * baseline with a very large shortfall AND a named content/audience mismatch.
 */
export function performanceWarning(views: number | null, baseline: { median: number; sample: number; source: string } | null, mismatch: string): string | null {
  if (views === null || !baseline || baseline.sample < 5 || baseline.median <= 0) return null;
  if (!mismatch.trim()) return null;
  if (views >= baseline.median * 0.1) return null;
  return `This video has ${views.toLocaleString()} views, under a tenth of the ${baseline.median.toLocaleString()} median across ${baseline.sample} comparable videos (${baseline.source}), and ${mismatch.trim()} You can still use it.`;
}

/** Compact reference carried into the script request. Pattern only, never wording to copy. */
export const scriptReferenceSchema = z.object({
  source: s(400),
  mode: z.enum(["video+audio", "video-only"]),
  hookPattern: s(400),
  beats: z.array(s(300)).max(8),
  visualPatterns: z.array(s(300)).max(6),
  pacing: s(400),
  idea: s(700).optional(),
});
export type ScriptReference = z.infer<typeof scriptReferenceSchema>;

export function toScriptReference(r: ReferenceAnalysisResult, idea?: { title: string; angle: string }): ScriptReference {
  const p = r.provenance;
  const who = [p.title && `"${p.title}"`, p.creator && `by ${p.creator}`].filter(Boolean).join(" ");
  return {
    source: `${p.kind === "upload" ? `Uploaded clip ${p.fileName ?? ""}` : p.url ?? ""}${who ? ` ${who}` : ""}`.trim().slice(0, 400),
    mode: r.mode,
    hookPattern: r.observed.scriptDirection.hookPattern.slice(0, 400),
    beats: r.observed.scriptDirection.beats.slice(0, 8),
    visualPatterns: r.observed.visualPatterns.slice(0, 6),
    pacing: r.observed.pacing.slice(0, 400),
    ...(idea ? { idea: `${idea.title}: ${idea.angle}`.slice(0, 700) } : {}),
  };
}
