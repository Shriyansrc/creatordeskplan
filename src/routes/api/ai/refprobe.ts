import { createFileRoute } from "@tanstack/react-router";
import { generateResponse } from "@lovable.dev/ai-gateway";

// Temporary read-only diagnostic: does the built-in gateway offer hosted web search?
export const Route = createFileRoute("/api/ai/refprobe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const q = u.searchParams.get("q") ?? "how to study for exams";
        const dom = u.searchParams.get("d") ?? "youtube.com";
        const t0 = Date.now();
        try {
          const res = (await generateResponse({
            model: "openai/gpt-6.1-terra",
            input: `Search the web for real short videos on this idea and list their page links: ${q}`,
            tools: [{ type: "web_search", filters: { allowed_domains: [dom] }, search_context_size: "low" }],
          } as never)) as unknown as { output?: Record<string, unknown>[]; usage?: unknown };
          const items = res.output ?? [];
          const cites: { url: string; title: string }[] = [];
          for (const it of items) {
            const content = (it["content"] as Record<string, unknown>[] | undefined) ?? [];
            for (const c of content) for (const a of (c["annotations"] as Record<string, string>[] | undefined) ?? []) if (a["url"]) cites.push({ url: a["url"], title: String(a["title"] ?? "").slice(0, 80) });
          }
          return Response.json({ ms: Date.now() - t0, types: items.map((i) => i["type"]), cites: cites.slice(0, 12), usage: res.usage });
        } catch (e) {
          return Response.json({ ms: Date.now() - t0, error: e instanceof Error ? e.message.slice(0, 300) : "failed" });
        }
      },
    },
  },
});
