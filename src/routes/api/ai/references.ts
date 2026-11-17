import { createFileRoute } from "@tanstack/react-router";
import { generateResponse } from "@lovable.dev/ai-gateway";
import { z } from "zod";
import { classify, verify, type WebPlatform, type WebVideo } from "@/lib/references/web";
import { terms } from "@/lib/references/contracts";

/**
 * Reference discovery with the built-in web search (not Google: Google answers servers with HTTP 429).
 * One search call per platform per request, results cached, requests capped per visitor and overall.
 * Every link returned was checked against its own platform page or oEmbed endpoint.
 */
const inputSchema = z.object({
  idea: z.string().trim().min(2).max(200),
  niche: z.string().trim().max(200).default(""),
  platform: z.enum(["yt", "ig", "li", "x"]),
});

const DOMAIN: Partial<Record<WebPlatform, string>> = { yt: "youtube.com", li: "linkedin.com" };
const WHAT: Record<WebPlatform, string> = { yt: "short videos on YouTube", ig: "Instagram reels", li: "LinkedIn video posts", x: "X posts with video" };

const HOUR = 3600_000;
const PER_VISITOR = 8;
const OVERALL = 80;
const hits = new Map<string, number[]>();
let overall: number[] = [];
const cache = new Map<string, { at: number; body: unknown }>();

function allow(key: string): boolean {
  const now = Date.now();
  overall = overall.filter((t) => now - t < HOUR);
  const mine = (hits.get(key) ?? []).filter((t) => now - t < HOUR);
  if (overall.length >= OVERALL || mine.length >= PER_VISITOR) return false;
  mine.push(now);
  overall.push(now);
  hits.set(key, mine);
  if (hits.size > 500) hits.clear();
  return true;
}

async function discover(platform: WebPlatform, idea: string, niche: string): Promise<{ url: string; title: string }[]> {
  const domain = DOMAIN[platform];
  if (!domain) return [];
  const res = (await generateResponse({
    model: "openai/gpt-6.1-terra",
    input: `Search the web for real, public ${WHAT[platform]} about this idea and list their page links. Idea: ${idea}.${niche ? ` Topic area: ${niche}.` : ""} Only individual video or post pages, no channels, no search pages.`,
    tools: [{ type: "web_search", filters: { allowed_domains: [domain] }, search_context_size: "low" }],
  } as never)) as unknown as { output?: Record<string, unknown>[] };
  const out: { url: string; title: string }[] = [];
  for (const item of res.output ?? []) {
    const content = (item["content"] as Record<string, unknown>[] | undefined) ?? [];
    for (const c of content) {
      for (const a of (c["annotations"] as Record<string, string>[] | undefined) ?? []) {
        if (typeof a["url"] === "string") out.push({ url: a["url"], title: String(a["title"] ?? "") });
      }
    }
  }
  return out;
}

export const Route = createFileRoute("/api/ai/references")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let input: z.infer<typeof inputSchema>;
        try { input = inputSchema.parse(await request.json()); }
        catch { return Response.json({ error: "Invalid reference search request" }, { status: 400 }); }
        const platform = input.platform;
        if (!DOMAIN[platform]) {
          return Response.json({ platform, supported: false, videos: [], note: `${platform === "ig" ? "Instagram" : "X"} discovery is unresolved: the route tested returned no ${platform === "ig" ? "Instagram" : "X"} pages in testing.` });
        }
        if (!process.env["LOVABLE_API_KEY"]) return Response.json({ error: "Built-in web search is not available in this app right now." }, { status: 503 });
        const cacheKey = `${platform}|${input.idea.toLowerCase()}|${input.niche.toLowerCase()}`;
        const cached = cache.get(cacheKey);
        if (cached && Date.now() - cached.at < 6 * HOUR) return Response.json({ ...(cached.body as object), cached: true });
        const who = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
        if (!allow(who)) return Response.json({ error: "Too many reference searches just now. Try again in a while." }, { status: 429 });
        try {
          const found = await discover(platform, input.idea, input.niche);
          const seen = new Set<string>();
          const candidates: { url: string; id: string; title: string }[] = [];
          for (const f of found) {
            const c = classify(f.url);
            if (!c || c.platform !== platform || seen.has(c.url)) continue;
            seen.add(c.url);
            candidates.push({ url: c.url, id: c.id, title: f.title });
          }
          const checked = await Promise.all(candidates.slice(0, 8).map((c) => verify({ platform, url: c.url, id: c.id, title: c.title, snippet: "", engine: "web search" })));
          const ideaTerms = terms(`${input.idea} ${input.niche}`);
          const videos = checked
            .filter((v): v is WebVideo => !!v)
            .map((v) => {
              const t = v.title.toLowerCase();
              const matched = ideaTerms.filter((w) => t.includes(w));
              return { ...v, why: matched.length ? `Title mentions: ${matched.join(", ")}.` : "Found by web search for your idea; the title does not repeat your words.", score: matched.length };
            })
            .sort((a, b) => b.score - a.score || (b.views ?? 0) - (a.views ?? 0));
          const body = { platform, supported: true, videos, searched: candidates.length, note: videos.length ? "" : "The search returned no pages that could be confirmed on the platform." };
          cache.set(cacheKey, { at: Date.now(), body });
          if (cache.size > 200) cache.clear();
          return Response.json(body);
        } catch (error) {
          return Response.json({ error: error instanceof Error ? `Search failed: ${error.message.slice(0, 160)}` : "Search failed" }, { status: 502 });
        }
      },
    },
  },
});
