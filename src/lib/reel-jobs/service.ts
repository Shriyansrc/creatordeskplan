import { z } from "zod";
import { platformSchema } from "@/lib/ai/contracts";

/** Account screen refresh interval for the reel job list. */
export const REEL_JOB_POLL_SECONDS = 30;
/** Worker pickup cadence (documented in docs/reel-jobs.md; the worker is not part of this app). */
export const REEL_WORKER_PICKUP_SECONDS = 120;
export const REEL_SOURCE_MAX_MB = 200;

export const reelBriefSchema = z.object({
  topic: z.string().trim().min(2).max(300),
  script: z.string().trim().min(1).max(10000),
  platform: platformSchema,
  lengthSeconds: z.number().int().min(5).max(180),
  notes: z.string().max(2000).default(""),
  videoSource: z.enum(["timeline", "upload"]),
});
export type ReelBrief = z.infer<typeof reelBriefSchema>;

export const REMOTE_STATUSES = ["submitted", "claimed", "in_progress", "ready", "failed", "canceled"] as const;
export const reelJobSchema = z.object({
  id: z.string().min(1).max(100),
  status: z.enum([...REMOTE_STATUSES, "saved_on_device"]),
  brief: reelBriefSchema,
  sourceFile: z.object({ name: z.string().max(300), size: z.number().int().min(0), type: z.string().max(100) }).nullable(),
  createdAt: z.string(),
  error: z.string().max(500).nullable().default(null),
  where: z.enum(["device", "remote"]),
});
export type ReelJob = z.infer<typeof reelJobSchema>;

export interface ReelJobService {
  readonly available: boolean;
  readonly reason: string;
  create(brief: ReelBrief, file: File | Blob | null): Promise<ReelJob>;
  list(): Promise<ReelJob[]>;
  get(id: string): Promise<ReelJob | null>;
  cancel(id: string): Promise<ReelJob | null>;
  downloadUrl(id: string): Promise<string | null>;
}

const STORAGE_KEY = "cd:reel-jobs";
const sessionFiles = new Map<string, File | Blob>();

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** Saves jobs on this device only. Briefs go to localStorage; attached video stays in memory. */
export class LocalReelJobService implements ReelJobService {
  readonly available = true;
  readonly reason = "Saved on this device, not sent: the reel service is not connected";
  constructor(private store: Store = window.localStorage) {}
  private read(): ReelJob[] {
    try { return z.array(reelJobSchema).parse(JSON.parse(this.store.getItem(STORAGE_KEY) ?? "[]")); } catch { return []; }
  }
  private write(jobs: ReelJob[]) { this.store.setItem(STORAGE_KEY, JSON.stringify(jobs)); }
  async create(brief: ReelBrief, file: File | Blob | null) {
    const parsed = reelBriefSchema.parse(brief);
    if (file && file.size > REEL_SOURCE_MAX_MB * 1024 * 1024) throw new Error(`The video is larger than ${REEL_SOURCE_MAX_MB} MB.`);
    const id = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const job: ReelJob = { id, status: "saved_on_device", brief: parsed, sourceFile: file ? { name: file instanceof File ? file.name : "timeline-export", size: file.size, type: file.type } : null, createdAt: new Date().toISOString(), error: null, where: "device" };
    if (file) sessionFiles.set(id, file);
    this.write([job, ...this.read()]);
    return job;
  }
  async list() { return this.read(); }
  async get(id: string) { return this.read().find((job) => job.id === id) ?? null; }
  async cancel(id: string) {
    const jobs = this.read().map((job) => (job.id === id ? { ...job, status: "canceled" as const } : job));
    this.write(jobs); sessionFiles.delete(id);
    return jobs.find((job) => job.id === id) ?? null;
  }
  async downloadUrl() { return null; }
}

/** Calls the account-scoped API described in docs/reel-jobs.md. Not connected in this project. */
export class RemoteReelJobService implements ReelJobService {
  readonly available: boolean;
  readonly reason: string;
  constructor(private baseUrl: string | null, private token: () => Promise<string | null>) {
    this.available = Boolean(baseUrl);
    this.reason = baseUrl ? "Connected" : "The reel service needs accounts, a database and storage, which are not enabled in this project.";
  }
  private async call<S extends z.ZodTypeAny>(path: string, init: RequestInit, schema: S): Promise<z.output<S>> {
    const token = await this.token();
    if (!this.baseUrl || !token) throw new Error(this.reason);
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Reel service HTTP ${response.status}`);
    return schema.parse(await response.json());
  }
  async create(brief: ReelBrief, file: File | Blob | null) {
    const form = new FormData();
    form.set("brief", JSON.stringify(reelBriefSchema.parse(brief)));
    if (file) form.set("source", file);
    return this.call("/reel-jobs", { method: "POST", body: form }, reelJobSchema);
  }
  list() { return this.call("/reel-jobs", { method: "GET" }, z.array(reelJobSchema)); }
  get(id: string) { return this.call(`/reel-jobs/${encodeURIComponent(id)}`, { method: "GET" }, reelJobSchema); }
  cancel(id: string) { return this.call(`/reel-jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" }, reelJobSchema); }
  async downloadUrl(id: string) { return (await this.call(`/reel-jobs/${encodeURIComponent(id)}/download`, { method: "GET" }, z.object({ url: z.string().url() }))).url; }
}

/** Remote when connected, otherwise device-only. No remote endpoint exists in this project. */
export function getReelJobService(): ReelJobService {
  const remote = new RemoteReelJobService(null, async () => null);
  return remote.available ? remote : new LocalReelJobService();
}

export function reelStatusLabel(job: ReelJob) {
  if (job.status === "saved_on_device") return "Saved on this device, not sent";
  if (job.status === "canceled") return "Canceled";
  return { submitted: "Submitted", claimed: "Claimed", in_progress: "In progress", ready: "Ready", failed: "Failed" }[job.status];
}

export function exportJobFile(job: ReelJob) {
  const blob = new Blob([JSON.stringify({ format: "creator-desk-reel-job/1", ...job, note: "Brief only. The source video is not included; attach it separately." }, null, 2)], { type: "application/json" });
  const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = `reel-job-${job.id}.json`; anchor.click();
}
