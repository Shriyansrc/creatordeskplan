import { describe, expect, it, vi } from "vitest";
import { createReferenceHandler, discoverReferences } from "@/lib/references/search.server";
import { authenticateReference } from "@/lib/references/quota.server";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), gateway: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@lovable.dev/ai-gateway", () => ({ generateResponse: mocks.gateway }));
const request = (token?: string, extra = {}) => new Request("http://localhost/api/ai/references", {
  method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), "x-forwarded-for": "spoofed" },
  body: JSON.stringify({ idea: "exam revision", platform: "yt", userId: "spoofed", ...extra }),
});
function setup() {
  const deps = { authenticate: vi.fn().mockResolvedValue({ userId: "verified-user" }), reserve: vi.fn().mockResolvedValue(true), discover: vi.fn().mockResolvedValue([]), verify: vi.fn() };
  return { deps, handler: createReferenceHandler(deps) };
}
describe("reference security", () => {
  it("missing bearer is 401 with no auth, reservation or inference", async () => {
    const { deps, handler } = setup();
    expect((await handler(request())).status).toBe(401);
    expect(deps.authenticate).not.toHaveBeenCalled();
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(deps.discover).not.toHaveBeenCalled();
  });
  it("invalid backend session is 401 with zero inference", async () => {
    const { deps, handler } = setup();
    deps.authenticate.mockResolvedValue({ status: 401 });
    expect((await handler(request("invalid"))).status).toBe(401);
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(deps.discover).not.toHaveBeenCalled();
  });
  it("validates the supplied token through backend auth.getUser", async () => {
    vi.stubEnv("SUPABASE_URL", "https://backend.invalid");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-publishable");
    mocks.getUser.mockResolvedValue({ data: { user: { id: "backend-user" } }, error: null });
    expect(await authenticateReference("session-token")).toEqual({ userId: "backend-user" });
    expect(mocks.getUser).toHaveBeenCalledWith("session-token");
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    expect(await authenticateReference("invalid")).toEqual({ status: 401 });
    vi.unstubAllEnvs();
  });
  it("reserves only backend verified ID before gateway", async () => {
    const { deps, handler } = setup();
    expect((await handler(request("valid"))).status).toBe(200);
    expect(deps.reserve).toHaveBeenCalledWith("verified-user");
    expect(deps.reserve.mock.invocationCallOrder[0]).toBeLessThan(deps.discover.mock.invocationCallOrder[0] ?? 0);
  });
  it("exhaustion returns 429 with zero inference", async () => {
    const { deps, handler } = setup();
    deps.reserve.mockResolvedValue(false);
    expect((await handler(request("valid"))).status).toBe(429);
    expect(deps.discover).not.toHaveBeenCalled();
  });
  it("database failure returns 503 with zero inference", async () => {
    const { deps, handler } = setup();
    deps.reserve.mockRejectedValue(new Error("RPC unavailable"));
    expect((await handler(request("valid"))).status).toBe(503);
    expect(deps.discover).not.toHaveBeenCalled();
  });
  it("cache hits still authenticate, but do not reserve or infer again", async () => {
    const { deps, handler } = setup();
    deps.discover.mockResolvedValue([{ url: "https://www.youtube.com/watch?v=abcdefghijk", title: "Exam revision tips", evidence: "search" }]);
    deps.verify.mockImplementation(async (h) => ({ ...h, author: "a", thumbnail: null, views: null, likes: null, verified: "platform", note: "" }));
    await handler(request("valid"));
    const cached = await handler(request("valid"));
    expect((await cached.json()).cached).toBe(true);
    expect(deps.reserve).toHaveBeenCalledTimes(1);
    expect(deps.discover).toHaveBeenCalledTimes(1);
    deps.authenticate.mockResolvedValue({ status: 401 });
    expect((await handler(request("invalid"))).status).toBe(401);
    expect((await handler(request())).status).toBe(401);
  });
  it("empty searches are never cached", async () => {
    const { deps, handler } = setup();
    await handler(request("valid"));
    const again = await (await handler(request("valid"))).json();
    expect(again.cached).toBeUndefined();
    expect(deps.discover).toHaveBeenCalledTimes(2);
  });
  it("search service errors are 502 and not cached", async () => {
    const { deps, handler } = setup();
    deps.discover.mockRejectedValueOnce(new Error("down"));
    const r = await handler(request("valid"));
    expect(r.status).toBe(502);
    await handler(request("valid"));
    expect(deps.discover).toHaveBeenCalledTimes(2);
  });
  it("Search again skips the cache but still reserves quota", async () => {
    const { deps, handler } = setup();
    deps.discover.mockResolvedValue([{ url: "https://www.youtube.com/watch?v=abcdefghijk", title: "x", evidence: "search" }]);
    deps.verify.mockImplementation(async (h) => ({ ...h, author: "", thumbnail: null, views: null, likes: null, verified: "platform", note: "" }));
    await handler(request("valid"));
    const fresh = await (await handler(request("valid", { fresh: true }))).json();
    expect(fresh.cached).toBeUndefined();
    expect(deps.reserve).toHaveBeenCalledTimes(2);
    expect(deps.discover).toHaveBeenCalledTimes(2);
  });
  it("gateway is bounded: 3 search steps, 3000 tokens, zero retries", async () => {
    mocks.gateway.mockResolvedValue({ output: [] });
    await discoverReferences("yt", "exam revision", "");
    expect(mocks.gateway).toHaveBeenCalledWith(expect.objectContaining({ max_tool_calls: 3, max_output_tokens: 3000, parallel_tool_calls: false }), { maxRetries: 0, retryWaitBudgetMs: 0 });
  });
  it("X stays unsupported without inference", async () => {
    const { deps, handler } = setup();
    expect((await (await handler(request("valid", { platform: "x" }))).json()).supported).toBe(false);
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(deps.discover).not.toHaveBeenCalled();
  });
});
