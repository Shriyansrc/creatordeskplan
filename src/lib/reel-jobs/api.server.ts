import { reelBriefSchema, REEL_SOURCE_MAX_MB, type ReelJob } from "./service";

/**
 * Account-scoped reel job API (server side). Every call runs as the signed-in user, through a
 * client that carries that user's own token, so the database and storage policies decide access.
 * No service credential is used here. The worker side is a separate path and is not part of this file.
 * If the tables do not exist yet, every route answers 503 "not configured" and changes nothing.
 */
export type JobRow = {
  id: string; user_id: string; status: ReelJob["status"]; brief_json: unknown;
  source_video_path: string | null; result_video_path: string | null; error: string | null; created_at: string;
};
type DbError = { code?: string; message?: string } | null;
export interface ReelJobStore {
  insert(userId: string, id: string, brief: unknown, sourcePath: string | null): Promise<{ row?: JobRow; error: DbError }>;
  list(): Promise<{ rows?: JobRow[]; error: DbError }>;
  get(id: string): Promise<{ row?: JobRow | null; error: DbError }>;
  cancel(id: string): Promise<{ row?: JobRow | null; error: DbError }>;
  upload(path: string, file: Blob): Promise<{ error: DbError }>;
  signedUrl(path: string, seconds: number): Promise<{ url?: string | undefined; error: DbError }>;
}
export type Auth = { userId: string; store: ReelJobStore } | { status: 401 | 503 };
export const SIGNED_URL_SECONDS = 600;

const json = (body: unknown, status = 200) => Response.json(body, { status });
const NOT_CONFIGURED = "The reel service is not set up yet. Nothing was saved or sent.";
const missing = (e: DbError) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache|bucket not found/i.test(e.message ?? ""));
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_NAME = (n: string) => n.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80) || "source";

export function toJob(row: JobRow): ReelJob {
  const brief = reelBriefSchema.safeParse(row.brief_json);
  return {
    id: row.id, status: row.status,
    brief: brief.success ? brief.data : { topic: "Reel", script: "-", platform: "ig" as never, lengthSeconds: 30, notes: "", videoSource: "timeline" },
    sourceFile: row.source_video_path ? { name: row.source_video_path.split("/").pop() ?? "source", size: 0, type: "" } : null,
    createdAt: row.created_at, error: row.error ? row.error.slice(0, 500) : null, where: "remote",
  };
}

export async function handleReelJobs(request: Request, parts: string[], authenticate: (token: string) => Promise<Auth>): Promise<Response> {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return json({ error: "Sign in to use reel jobs." }, 401);
  const auth = await authenticate(token).catch(() => ({ status: 503 as const }));
  if ("status" in auth) return json({ error: auth.status === 401 ? "Sign in to use reel jobs." : "Reel jobs are unavailable." }, auth.status);
  const { userId, store } = auth;
  const [id, action] = parts;
  if (id !== undefined && !ID.test(id)) return json({ error: "Not found" }, 404);
  const m = request.method;

  if (!id && m === "GET") {
    const { rows, error } = await store.list();
    if (missing(error)) return json({ error: NOT_CONFIGURED }, 503);
    if (error || !rows) return json({ error: "Could not load jobs." }, 502);
    return json(rows.filter((r) => r.user_id === userId).map(toJob));
  }

  if (!id && m === "POST") {
    let form: FormData;
    try { form = await request.formData(); } catch { return json({ error: "Expected a form." }, 400); }
    const raw = form.get("brief");
    if (typeof raw !== "string" || raw.length > 20000) return json({ error: "Invalid brief." }, 400);
    let brief;
    try { brief = reelBriefSchema.parse(JSON.parse(raw)); } catch { return json({ error: "Invalid brief." }, 400); }
    const file = form.get("source");
    if (file instanceof Blob && file.size > REEL_SOURCE_MAX_MB * 1024 * 1024) return json({ error: `The video is larger than ${REEL_SOURCE_MAX_MB} MB.` }, 413);
    const hasFile = file instanceof Blob && file.size > 0;
    const jobId = crypto.randomUUID();
    const name = file instanceof File ? file.name : "timeline-export.mp4";
    const path = hasFile ? `${userId}/${jobId}/${SAFE_NAME(name)}` : null;
    const { row, error } = await store.insert(userId, jobId, brief, path);
    if (missing(error)) return json({ error: NOT_CONFIGURED }, 503);
    if (error || !row) return json({ error: "Could not save the job." }, 502);
    if (hasFile && path) {
      const up = await store.upload(path, file as Blob);
      if (up.error) {
        await store.cancel(row.id);
        return json({ error: missing(up.error) ? NOT_CONFIGURED : "The video could not be stored. The job was canceled." }, missing(up.error) ? 503 : 502);
      }
    }
    return json(toJob(row), 201);
  }

  if (id && !action && m === "GET") {
    const { row, error } = await store.get(id);
    if (missing(error)) return json({ error: NOT_CONFIGURED }, 503);
    if (error) return json({ error: "Could not load the job." }, 502);
    return row && row.user_id === userId ? json(toJob(row)) : json({ error: "Not found" }, 404);
  }

  if (id && action === "cancel" && m === "POST") {
    const { row, error } = await store.cancel(id);
    if (missing(error)) return json({ error: NOT_CONFIGURED }, 503);
    if (error) return json({ error: "Could not cancel." }, 502);
    // Only a job still waiting can be canceled. Anything else (or someone else's) looks the same.
    return row && row.user_id === userId ? json(toJob(row)) : json({ error: "This job can no longer be canceled." }, 409);
  }

  if (id && action === "download" && m === "GET") {
    const { row, error } = await store.get(id);
    if (missing(error)) return json({ error: NOT_CONFIGURED }, 503);
    if (error) return json({ error: "Could not load the job." }, 502);
    if (!row || row.user_id !== userId) return json({ error: "Not found" }, 404);
    if (row.status !== "ready" || !row.result_video_path) return json({ error: "The reel is not ready." }, 409);
    if (!row.result_video_path.startsWith(`${userId}/`)) return json({ error: "Not found" }, 404);
    const { url, error: e2 } = await store.signedUrl(row.result_video_path, SIGNED_URL_SECONDS);
    return url ? json({ url }) : json({ error: missing(e2) ? NOT_CONFIGURED : "Could not prepare the download." }, missing(e2) ? 503 : 502);
  }
  return json({ error: "Not found" }, 404);
}
