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
    await handler(request("valid"));
    const cached = await handler(request("valid"));
    expect((await cached.json()).cached).toBe(true);
    expect(deps.reserve).toHaveBeenCalledTimes(1);
    expect(deps.discover).toHaveBeenCalledTimes(1);
    deps.authenticate.mockResolvedValue({ status: 401 });
    expect((await handler(request("invalid"))).status).toBe(401);
    expect((await handler(request())).status).toBe(401);
  });
  it("gateway has one tool call, 1024 tokens, and zero retries", async () => {
    mocks.gateway.mockResolvedValue({ output: [] });
    await discoverReferences("yt", "exam revision", "");
    expect(mocks.gateway).toHaveBeenCalledWith(expect.objectContaining({ max_tool_calls: 1, max_output_tokens: 1024, parallel_tool_calls: false }), { maxRetries: 0, retryWaitBudgetMs: 0 });
  });
  it("IG and X remain unresolved without inference", async () => {
    const { deps, handler } = setup();
    for (const platform of ["ig", "x"]) expect((await (await handler(request("valid", { platform }))).json()).supported).toBe(false);
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(deps.discover).not.toHaveBeenCalled();
  });
});