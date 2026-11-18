import { describe, expect, it, vi } from "vitest";
vi.mock("@lovable.dev/ai-gateway", () => ({ generateChatCompletion: vi.fn() }));
import { createAnalysisHandler, parseObserved } from "@/lib/reference-analysis/analyse.server";
import { MAX_UPLOAD_BYTES, performanceWarning, platformOfLink, toScriptReference, type Observed, type ReferenceAnalysisResult } from "@/lib/reference-analysis/contracts";
import { scriptInputSchema } from "@/lib/ai/contracts";

const observed: Observed = {
  canSee: true, speechHeard: true, hook: "Opens on a blue square with BAKERY TIPS", spokenPoints: ["Put your phone number at the top"],
  onScreenText: [{ at: "0:00", text: "BAKERY TIPS" }], structure: [{ start: "0:00", end: "0:05", beat: "Title card" }],
  visualPatterns: ["Bold text card"], pacing: "One cut at 5s", durationSeconds: 10, topicFit: "Fits", fitCaution: "",
  ideas: [{ title: "Three things a cafe site needs", angle: "Same list format" }], scriptDirection: { hookPattern: "Number promise", beats: ["Tip one", "Tip two"], notes: "" }, avoidCopying: [],
};
const mp4 = () => new File([new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 1, 2, 3, 4])], "clip.mp4", { type: "video/mp4" });
function setup() {
  const deps = {
    authenticate: vi.fn().mockResolvedValue({ userId: "u1" }),
    reserve: vi.fn().mockResolvedValue(true),
    watch: vi.fn().mockResolvedValue({ observed, audioTokens: 200, videoTokens: 700 }),
    ytDetails: vi.fn().mockResolvedValue({ title: "Me at the zoo", author: "jawed", views: null }),
    now: () => new Date("2026-11-18T00:00:00Z"),
  };
  return { deps, handler: createAnalysisHandler(deps) };
}
const req = (fields: Record<string, string | File>, token: string | null = "tok") => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("http://x/api/ai/reference-video", { method: "POST", body: fd, headers: token ? { authorization: `Bearer ${token}` } : {} });
};

describe("reference analysis", () => {
  it("link-only YouTube input is watched with no transcript or stats", async () => {
    const { deps, handler } = setup();
    const r = await handler(req({ link: "https://youtu.be/jNQXAC9IVRw", topic: "zoos" }));
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body.mode).toBe("video+audio");
    expect(deps.watch).toHaveBeenCalledWith({ kind: "link", url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" }, expect.objectContaining({ topic: "zoos" }));
  });
  it("file-only input is sent inline as a data URL and labelled as an upload", async () => {
    const { deps, handler } = setup();
    const body = await (await handler(req({ file: mp4() }))).json();
    expect(deps.watch.mock.calls[0]?.[0].dataUrl.startsWith("data:video/mp4;base64,")).toBe(true);
    expect(body.provenance.kind).toBe("upload");
    expect(body.metrics.views.value).toBeNull();
  });
  it("missing media, fake video and wrong type are rejected before quota or inference", async () => {
    const { deps, handler } = setup();
    expect((await handler(req({ topic: "x" }))).status).toBe(400);
    expect((await handler(req({ file: new File(["hello world!"], "a.mp4", { type: "video/mp4" }) }))).status).toBe(415);
    expect((await handler(req({ file: new File(["x"], "a.gif", { type: "image/gif" }) }))).status).toBe(415);
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(deps.watch).not.toHaveBeenCalled();
  });
  it("uploads over 15 MB stop before quota and inference", async () => {
    const { deps, handler } = setup();
    const file = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "large.mp4", { type: "video/mp4" });
    expect((await handler(req({ file }))).status).toBe(413);
    expect(MAX_UPLOAD_BYTES).toBe(15 * 1024 * 1024);
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(deps.watch).not.toHaveBeenCalled();
  });
  it("auth is required and quota is reserved before inference; exhaustion stops it", async () => {
    const { deps, handler } = setup();
    expect((await handler(req({ link: "https://youtu.be/jNQXAC9IVRw" }, null))).status).toBe(401);
    deps.authenticate.mockResolvedValueOnce({ status: 401 });
    expect((await handler(req({ link: "https://youtu.be/jNQXAC9IVRw" }, "bad")))).toHaveProperty("status", 401);
    deps.reserve.mockResolvedValueOnce(false);
    expect((await handler(req({ link: "https://youtu.be/jNQXAC9IVRw" }))).status).toBe(429);
    expect(deps.watch).not.toHaveBeenCalled();
  });
  it("unsupported and private-host links are rejected", async () => {
    const { deps, handler } = setup();
    for (const link of ["http://youtube.com/watch?v=jNQXAC9IVRw", "https://127.0.0.1/a.mp4", "https://169.254.169.254/latest", "https://evil.com/redirect?to=youtube.com", "https://youtube.com.evil.com/watch?v=jNQXAC9IVRw", "https://user@youtube.com/watch?v=jNQXAC9IVRw", "https://www.youtube.com/@channel"]) {
      expect((await handler(req({ link }))).status).toBe(400);
    }
    expect(platformOfLink("https://localhost/x")).toBeNull();
    expect(deps.watch).not.toHaveBeenCalled();
  });
  it("Instagram links offer the upload path without spending quota", async () => {
    const { deps, handler } = setup();
    const body = await (await handler(req({ link: "https://www.instagram.com/reel/ABCDE12/" }))).json();
    expect(body.status).toBe("needs_upload");
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(deps.watch).not.toHaveBeenCalled();
  });
  it("silent clips are labelled video-only, and unseen video is an honest error", async () => {
    const { deps, handler } = setup();
    deps.watch.mockResolvedValueOnce({ observed: { ...observed, speechHeard: false, spokenPoints: [] }, audioTokens: 0, videoTokens: 500 });
    expect((await (await handler(req({ file: mp4() }))).json()).mode).toBe("video-only");
    deps.watch.mockResolvedValueOnce({ observed: { ...observed, canSee: false }, audioTokens: 0, videoTokens: 0 });
    const result = await handler(req({ file: mp4() }));
    expect(result.status).toBe(502);
    expect((await result.json()).status).not.toBe("analysed");
  });
  it("a malformed AI answer is a 502 with no retry", async () => {
    const { deps, handler } = setup();
    deps.watch.mockRejectedValueOnce(Object.assign(new Error("no json")));
    expect((await handler(req({ file: mp4() }))).status).toBe(502);
    expect(deps.watch).toHaveBeenCalledTimes(1);
    expect(() => parseObserved("not json")).toThrow();
  });
  it("unknown metrics stay unknown and never trigger an underperformance warning", async () => {
    const { handler } = setup();
    const body = await (await handler(req({ link: "https://youtu.be/jNQXAC9IVRw" }))).json();
    expect(body.metrics.views.value).toBeNull();
    expect(body.metrics.likes.value).toBeNull();
    expect(body.warning).toBeNull();
    expect(performanceWarning(null, { median: 10000, sample: 20, source: "s" }, "mismatch.")).toBeNull();
    expect(performanceWarning(50, null, "mismatch.")).toBeNull();
    expect(performanceWarning(50, { median: 10000, sample: 20, source: "s" }, "")).toBeNull();
    expect(performanceWarning(50, { median: 10000, sample: 20, source: "s" }, "it targets kids, not business owners.")).toContain("You can still use it");
  });
  it("analysis flows into a valid script request with provenance and the chosen idea", () => {
    const r: ReferenceAnalysisResult = { status: "analysed", mode: "video+audio", evidence: "", provenance: { kind: "link", platform: "yt", url: "https://www.youtube.com/watch?v=jNQXAC9IVRw", fileName: null, title: "Me at the zoo", creator: "jawed" }, observed, metrics: {} as never, warning: null, analysedAt: "" };
    const ref = toScriptReference(r, observed.ideas[0]);
    expect(ref.source).toContain("jNQXAC9IVRw");
    expect(ref.idea).toBe("Three things a cafe site needs: Same list format");
    const input = scriptInputSchema.parse({ topic: "cafe sites", niche: "web", goal: "leads", platform: "yt", painPoint: "", researchKeywords: [], reference: ref, language: "Hinglish" });
    expect(input.reference?.hookPattern).toBe("Number promise");
    expect(input.language).toBe("Hinglish");
  });
});
