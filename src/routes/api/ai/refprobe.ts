import { createFileRoute } from "@tanstack/react-router";
import { searchWeb, verify, type EngineLog, type WebPlatform } from "@/lib/references/web";

// Temporary read-only diagnostic of the keyless reference lookups.
export const Route = createFileRoute("/api/ai/refprobe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams.get("q") ?? "how to study for exams";
        const log: EngineLog[] = [];
        const result: Record<string, unknown> = {};
        for (const p of ["yt", "ig", "x", "li"] as WebPlatform[]) {
          const hits = await searchWeb(p, q, log);
          const checked = await Promise.all(hits.slice(0, 4).map((h) => verify(h)));
          result[p] = { found: hits.length, sample: hits.slice(0, 4).map((h) => ({ url: h.url, t: h.title.slice(0, 50), e: h.engine })), verified: checked.map((c) => c && { t: c.title.slice(0, 50), a: c.author, th: c.thumbnail ? c.thumbnail.slice(0, 55) : null, v: c.views, l: c.likes, ok: c.verified }) };
        }
        return Response.json({ log, result });
      },
    },
  },
});
