import { generateResponse } from "@lovable.dev/ai-gateway";
import { z } from "zod";
import { classify, verify, type WebPlatform, type WebVideo } from "./web";
import { terms } from "./contracts";
import { authenticateReference, reserveReferenceSearch, type VerifiedSession } from "./quota.server";

const inputSchema = z.object({
  idea: z.string().trim().min(2).max(200),
  niche: z.string().trim().max(200).default(""),
  platform: z.enum(["yt", "ig", "li", "x"]),
  fresh: z.boolean().default(false),
});
type SearchInput = z.infer<typeof inputSchema>;
/** evidence "search": the web search tool listed or cited the page. "text": only the model's answer text named it. */
export type Link = { url: string; title: string; evidence: "search" | "text" };
const SUPPORTED: WebPlatform[] = ["yt", "ig", "li"];
const WHAT: Record<WebPlatform, string> = {
  yt: "individual YouTube videos (youtube.com/watch or youtube.com/shorts pages)",
  ig: "individual Instagram reels (instagram.com/reel/ or instagram.com/p/ pages)",
  li: "individual LinkedIn video posts (linkedin.com/posts/ or linkedin.com/feed/update/ pages)",
  x: "X posts with video",
};
const WORD: Record<WebPlatform, string> = { yt: "youtube video", ig: "instagram reel", li: "linkedin video post", x: "x video" };
const CACHE_TTL = 30 * 60_000;

const linkSchema = z.object({ url: z.string().optional(), title: z.string().optional() }).passthrough();
const responseSchema = z.object({ output: z.array(z.object({
  type: z.string().optional(),
  action: z.object({ sources: z.array(linkSchema).optional() }).passthrough().optional(),
  content: z.array(z.object({ text: z.string().optional(), annotations: z.array(linkSchema).optional() }).passthrough()).optional(),
}).passthrough()).optional() }).passthrough();

/** Pull links from a real web search response. Never builds or guesses URLs. */
export function extractLinks(raw: unknown): Link[] {
  const res = responseSchema.parse(raw);
  const out: Link[] = [];
  const seen = new Set<string>();
  const add = (url: string, title: string, evidence: Link["evidence"]) => {
    const key = url.replace(/[).,;\]]+$/, "");
    const prior = out.find((l) => l.url === key);
    if (prior) { if (evidence === "search") prior.evidence = "search"; if (!prior.title && title) prior.title = title; return; }
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ url: key, title, evidence });
  };
  for (const item of res.output ?? []) {
    for (const s of item.action?.sources ?? []) if (s.url) add(s.url, s.title ?? "", "search");
    for (const c of item.content ?? []) {
      for (const a of c.annotations ?? []) if (a.url) add(a.url, a.title ?? "", "search");
      for (const m of (c.text ?? "").matchAll(/https?:\/\/[^\s<>"'\])]+/g)) add(m[0], "", "text");
    }
  }
  return out;
}

export async function discoverReferences(platform: WebPlatform, idea: string, niche: string): Promise<Link[]> {
  if (!SUPPORTED.includes(platform)) return [];
  const res = await generateResponse({
    model: "openai/gpt-6.1-terra",
    input: `Search the web for ${WHAT[platform]} that match this idea: "${idea}".${niche ? ` Topic area: ${niche}.` : ""}
Turn the idea into 2 or 3 short plain search queries that keep its meaning, and add "${WORD[platform]}" to each. Do not use the site: operator.
Reply with only the matching page links you actually saw in the search results, one per line, followed by the title. Skip profiles, channels, playlists, articles and search pages. Never guess or build a link. At most ten links.`,
    tools: [{ type: "web_search", search_context_size: "medium" }],
    include: ["web_search_call.action.sources"],
    max_tool_calls: 3,
    max_output_tokens: 3000,
    reasoning: { effort: "low" },
    parallel_tool_calls: false,
  }, { maxRetries: 0, retryWaitBudgetMs: 0 });
  return extractLinks(res);
}


type Dependencies = {
  authenticate: (token: string) => Promise<VerifiedSession>;
  reserve: (userId: string) => Promise<boolean>;
  discover: (platform: WebPlatform, idea: string, niche: string) => Promise<Link[]>;
  verify: typeof verify;
};

/** Only cached results live in memory. Authorization and spending limits never do. */
export function createReferenceHandler(deps: Dependencies) {
  const cache = new Map<string, { at: number; body: object }>();
  return async (request: Request): Promise<Response> => {
    const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
    const token = match?.[1];
    if (!token) return Response.json({ error: "Sign in to search references." }, { status: 401 });
    let session: VerifiedSession;
    try { session = await deps.authenticate(token); }
    catch { return Response.json({ error: "Reference authentication is unavailable." }, { status: 503 }); }
    if (session.status) return Response.json({ error: session.status === 401 ? "Sign in to search references." : "Reference authentication is unavailable." }, { status: session.status });
    let input: SearchInput;
    try { input = inputSchema.parse(await request.json()); }
    catch { return Response.json({ error: "Invalid reference search request" }, { status: 400 }); }
    const platform = input.platform;
    if (!SUPPORTED.includes(platform)) return Response.json({ platform, supported: false, status: "empty", videos: [], unverified: [], note: "X discovery is not supported yet." });
    const cacheKey = `${platform}|${input.idea.toLowerCase()}|${input.niche.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (!input.fresh && cached && Date.now() - cached.at < CACHE_TTL) return Response.json({ ...cached.body, cached: true });
    try {
      if (!await deps.reserve(session.userId)) return Response.json({ error: "Reference search limit reached. Try again later." }, { status: 429 });
    } catch {
      return Response.json({ error: "Reference search quota is unavailable. No search was run." }, { status: 503 });
    }
    let found: Link[];
    try { found = await deps.discover(platform, input.idea, input.niche); }
    catch { cache.delete(cacheKey); return Response.json({ status: "error", error: "The web search service failed. Nothing was saved and no automatic retry was made." }, { status: 502 }); }
    const body = await buildResults(platform, `${input.idea} ${input.niche}`, found, deps.verify);
    if (body.videos.length || body.unverified.length) {
      cache.set(cacheKey, { at: Date.now(), body });
      if (cache.size > 200) cache.clear();
    } else cache.delete(cacheKey);
    return Response.json(body);
  };
}

type Result = WebVideo & { why: string; score: number };
export async function buildResults(platform: WebPlatform, idea: string, found: Link[], check: typeof verify) {
  const seen = new Set<string>();
  const candidates: { url: string; id: string; title: string; evidence: Link["evidence"] }[] = [];
  for (const f of found) {
    const c = classify(f.url);
    if (!c || c.platform !== platform || seen.has(c.url)) continue;
    seen.add(c.url);
    candidates.push({ url: c.url, id: c.id, title: f.title, evidence: f.evidence });
  }
  const list = candidates.slice(0, 10);
  const checked = await Promise.all(list.map((c) => check({ platform, url: c.url, id: c.id, title: c.title, snippet: "", engine: "web search" })));
  const ideaTerms = terms(idea);
  const confirmed: Result[] = [];
  const unverified: Result[] = [];
  checked.forEach((v, i) => {
    if (!v) return;
    // Links named only in the answer text, with no search evidence, are shown only when the platform confirms them.
    if (list[i]!.evidence === "text" && v.verified !== "platform") return;
    const title = v.title || list[i]!.title;
    const matched = ideaTerms.filter((w) => title.toLowerCase().includes(w));
    const r = { ...v, title: title || "Untitled (no title from search)", why: matched.length ? `Title mentions: ${matched.join(", ")}.` : "Found by web search for your idea; the title does not repeat your words.", score: matched.length };
    (v.verified === "platform" ? confirmed : unverified).push(r);
  });
  const byRelevance = (a: Result, b: Result) => b.score - a.score;
  confirmed.sort(byRelevance);
  unverified.sort(byRelevance);
  const status = confirmed.length ? "ok" : unverified.length ? "unverified" : "empty";
  const note = status === "empty"
    ? candidates.length ? "Search found pages, but the platform says they no longer exist." : "The search worked but found no matching video pages for this idea."
    : status === "unverified" ? "Search found links, but the platform blocked the check, so none is confirmed as a video." : "";
  return { platform, supported: true, status, videos: confirmed, unverified, searched: candidates.length, note };
}

export const handleReferenceSearch = createReferenceHandler({
  authenticate: authenticateReference,
  reserve: reserveReferenceSearch,
  discover: discoverReferences,
  verify,
});