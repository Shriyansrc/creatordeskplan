import { generateResponse } from "@lovable.dev/ai-gateway";
import { z } from "zod";
import { classify, verify, type WebPlatform, type WebVideo } from "./web";
import { terms } from "./contracts";
import { authenticateReference, reserveReferenceSearch, type VerifiedSession } from "./quota.server";

const inputSchema = z.object({
  idea: z.string().trim().min(2).max(200),
  niche: z.string().trim().max(200).default(""),
  platform: z.enum(["yt", "ig", "li", "x"]),
});
type SearchInput = z.infer<typeof inputSchema>;
type Link = { url: string; title: string };
const DOMAIN: Partial<Record<WebPlatform, string>> = { yt: "youtube.com", li: "linkedin.com" };
const WHAT: Record<WebPlatform, string> = { yt: "short videos on YouTube", ig: "Instagram reels (links must be instagram.com/reel/ pages)", li: "LinkedIn video posts", x: "X posts with video" };
const CACHE_TTL = 6 * 3600_000;

export async function discoverReferences(platform: WebPlatform, idea: string, niche: string): Promise<Link[]> {
  const domain = DOMAIN[platform];
  // Instagram has no domain filter: the filtered search returned no Instagram pages. Links are still kept only if they classify as instagram.com/reel pages.
  if (!domain && platform !== "ig") return [];
  const res = await generateResponse({
    model: "openai/gpt-6.1-terra",
    input: `Search the web for real, public ${WHAT[platform]} that a creator could copy the format of. Idea: ${idea}.${niche ? ` Topic area: ${niche}.` : ""} Search the way a viewer would: use the exact phrases people type for this topic plus one or two close variants. Prefer videos whose title clearly matches the idea, that are popular on the page, and that are recent. Skip compilations, ads, news, channels, playlists and search pages. Only individual video or post pages that you actually found. Never guess or build a link. Return at most eight links, concisely.`,
    tools: [{ type: "web_search", ...(domain ? { filters: { allowed_domains: [domain] } } : {}), search_context_size: "low" }],
    max_tool_calls: 1,
    max_output_tokens: 1024,
    parallel_tool_calls: false,
  }, { maxRetries: 0, retryWaitBudgetMs: 0 });
  const output = z.object({ output: z.array(z.object({
    content: z.array(z.object({
      annotations: z.array(z.object({ url: z.string().optional(), title: z.string().optional() }).passthrough()).optional(),
    }).passthrough()).optional(),
  }).passthrough()).optional() }).parse(res);
  return (output.output ?? []).flatMap((item) => (item.content ?? []).flatMap((content) =>
    (content.annotations ?? []).flatMap((a) => a.url ? [{ url: a.url, title: a.title ?? "" }] : [])));
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
    if (!DOMAIN[platform] && platform !== "ig") return Response.json({ platform, supported: false, videos: [], note: "X discovery is unresolved: the route tested returned no X pages in testing." });
    const cacheKey = `${platform}|${input.idea.toLowerCase()}|${input.niche.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL) return Response.json({ ...cached.body, cached: true });
    try {
      if (!await deps.reserve(session.userId)) return Response.json({ error: "Reference search limit reached. Try again later." }, { status: 429 });
    } catch {
      return Response.json({ error: "Reference search quota is unavailable. No search was run." }, { status: 503 });
    }
    try {
      const found = await deps.discover(platform, input.idea, input.niche);
      const seen = new Set<string>();
      const candidates: { url: string; id: string; title: string }[] = [];
      for (const f of found) {
        const c = classify(f.url);
        if (!c || c.platform !== platform || seen.has(c.url)) continue;
        seen.add(c.url);
        candidates.push({ url: c.url, id: c.id, title: f.title });
      }
      const checked = await Promise.all(candidates.slice(0, 8).map((c) => deps.verify({ platform, ...c, snippet: "", engine: "web search" })));
      const ideaTerms = terms(`${input.idea} ${input.niche}`);
      const videos = checked.filter((v): v is WebVideo => !!v).map((v) => {
        const matched = ideaTerms.filter((w) => v.title.toLowerCase().includes(w));
        return { ...v, why: matched.length ? `Title mentions: ${matched.join(", ")}.` : "Found by web search for your idea; the title does not repeat your words.", score: matched.length };
      }).sort((a, b) => b.score - a.score || (b.views ?? 0) - (a.views ?? 0));
      const body = { platform, supported: true, videos, searched: candidates.length, note: videos.length ? "" : "The search returned no pages that could be confirmed on the platform." };
      cache.set(cacheKey, { at: Date.now(), body });
      if (cache.size > 200) cache.clear();
      return Response.json(body);
    } catch {
      return Response.json({ error: "Reference search failed. No automatic retry was made." }, { status: 502 });
    }
  };
}

export const handleReferenceSearch = createReferenceHandler({
  authenticate: authenticateReference,
  reserve: reserveReferenceSearch,
  discover: discoverReferences,
  verify,
});