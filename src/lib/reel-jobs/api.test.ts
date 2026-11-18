import { describe, it, expect } from "vitest";
import { handleReelJobs, type JobRow, type ReelJobStore, type Auth } from "./api.server";
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222";
const rows: JobRow[] = []; const files = new Map<string, number>();
function store(uid: string, opts: { missing?: boolean } = {}): ReelJobStore {
  const mine = () => rows.filter((r) => r.user_id === uid); // simulates row policy
  const miss = opts.missing ? { code: "42P01", message: "relation does not exist" } : null;
  return {
    insert: async (u, id, brief, p) => { if (miss) return { error: miss }; if (u !== uid) return { error: { message: "rls" } }; const row: JobRow = { id, user_id: u, status: "submitted", brief_json: brief, source_video_path: p, result_video_path: null, error: null, created_at: "t" }; rows.push(row); return { row, error: null }; },
    list: async () => (miss ? { error: miss } : { rows: mine(), error: null }),
    get: async (id) => ({ row: mine().find((r) => r.id === id) ?? null, error: miss }),
    cancel: async (id) => { const r = mine().find((x) => x.id === id && x.status === "submitted"); if (r) r.status = "canceled"; return { row: r ?? null, error: null }; },
    upload: async (p, f) => { if (!p.startsWith(uid + "/")) return { error: { message: "rls" } }; files.set(p, f.size); return { error: null }; },
    signedUrl: async (p) => ({ url: "https://signed.example/" + p, error: null }),
  };
}
const auth = (uid: string, o?: { missing?: boolean }) => async (t: string): Promise<Auth> => t === "bad" ? { status: 401 } : { userId: uid, store: store(uid, o) };
const brief = { topic: "Topic", script: "Script", platform: "ig", lengthSeconds: 30, notes: "", videoSource: "upload" };
const post = (b: unknown, f?: File) => { const fd = new FormData(); fd.set("brief", JSON.stringify(b)); if (f) fd.set("source", f); return new Request("http://x/api/reel-jobs", { method: "POST", body: fd, headers: { authorization: "Bearer tok" } }); };
const get = (t = "tok") => new Request("http://x/", { headers: { authorization: `Bearer ${t}` } });
describe("reel job api (local fixture, simulated policies)", () => {
  it("rejects missing and bad tokens", async () => {
    expect((await handleReelJobs(new Request("http://x/"), [], auth(A))).status).toBe(401);
    expect((await handleReelJobs(get("bad"), [], auth(A))).status).toBe(401);
  });
  it("creates with source in own folder, lists, isolates users", async () => {
    const r = await handleReelJobs(post(brief, new File(["abc"], "My Clip!.mp4")), [], auth(A));
    expect(r.status).toBe(201); const job = await r.json();
    expect(job.where).toBe("remote"); expect(job.status).toBe("submitted");
    expect([...files.keys()][0]).toBe(`${A}/${job.id}/My_Clip_.mp4`);
    expect((await (await handleReelJobs(get(), [], auth(A))).json()).length).toBe(1);
    expect((await (await handleReelJobs(get(), [], auth(B))).json()).length).toBe(0);
    expect((await handleReelJobs(get(), [job.id], auth(B))).status).toBe(404);
    expect((await handleReelJobs(new Request("http://x/", { method: "POST", headers: { authorization: "Bearer t" } }), [job.id, "cancel"], auth(B))).status).toBe(409);
    expect((await handleReelJobs(get(), [job.id, "download"], auth(A))).status).toBe(409); // not ready
    const c = await handleReelJobs(new Request("http://x/", { method: "POST", headers: { authorization: "Bearer t" } }), [job.id, "cancel"], auth(A));
    expect((await c.json()).status).toBe("canceled");
  });
  it("download only when ready and inside own folder", async () => {
    const row = rows[0]!; row.status = "ready"; row.result_video_path = `${B}/x/r.mp4`;
    expect((await handleReelJobs(get(), [row.id, "download"], auth(A))).status).toBe(404);
    row.result_video_path = `${A}/${row.id}/r.mp4`;
    const d = await handleReelJobs(get(), [row.id, "download"], auth(A));
    expect((await d.json()).url).toContain(`signed.example/${A}`);
  });
  it("validates input and size", async () => {
    expect((await handleReelJobs(post({ topic: "" }), [], auth(A))).status).toBe(400);
    expect((await handleReelJobs(get(), ["not-a-uuid"], auth(A))).status).toBe(404);
  });
  it("answers 503 not configured when tables are missing, saves nothing", async () => {
    const n = rows.length;
    const r = await handleReelJobs(post(brief), [], auth(A, { missing: true }));
    expect(r.status).toBe(503); expect((await r.json()).error).toMatch(/not set up/); expect(rows.length).toBe(n);
    expect((await handleReelJobs(get(), [], auth(A, { missing: true }))).status).toBe(503);
  });
});
