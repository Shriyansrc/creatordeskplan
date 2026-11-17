import { createFileRoute } from "@tanstack/react-router";

// Temporary read-only diagnostic: which keyless web lookups work from this server runtime.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function probe(name: string, url: string, init?: RequestInit) {
  const t0 = Date.now();
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(url, { ...init, signal: ctl.signal, redirect: "follow", headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9", ...(init?.headers ?? {}) } });
    const text = await r.text();
    clearTimeout(timer);
    const yt = [...text.matchAll(/https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w-]{11})/g)].map((m) => m[1]);
    const yt2 = [...text.matchAll(/youtube\.com%2Fwatch%3Fv%3D([\w-]{11})/g)].map((m) => m[1]);
    const ig = [...text.matchAll(/instagram\.com\/(?:reel|p)\/([\w-]+)/g)].map((m) => m[1]);
    return { name, status: r.status, ms: Date.now() - t0, finalUrl: r.url.slice(0, 120), bytes: text.length, ytIds: Array.from(new Set([...yt, ...yt2])).slice(0, 8), igIds: Array.from(new Set(ig)).slice(0, 5), head: text.slice(0, 160).replace(/\s+/g, " "), views: (text.match(/"viewCount":"(\d+)"/) ?? [])[1] ?? null };
  } catch (e) {
    return { name, error: e instanceof Error ? e.message.slice(0, 120) : "failed", ms: Date.now() - t0 };
  }
}

export const Route = createFileRoute("/api/ai/refprobe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams.get("q") ?? "study tips for students";
        const eq = encodeURIComponent(`site:youtube.com/watch ${q}`);
        const eqi = encodeURIComponent(`site:instagram.com/reel ${q}`);
        const out = await Promise.all([
          probe("google-basic", `https://www.google.com/search?gbv=1&hl=en&num=20&q=${eq}`),
          probe("google-web", `https://www.google.com/search?hl=en&num=20&q=${eq}`),
          probe("ddg-html", "https://html.duckduckgo.com/html/", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `q=${eq}` }),
          probe("bing", `https://www.bing.com/search?setlang=en&count=30&q=${eq}`),
          probe("bing-ig", `https://www.bing.com/search?setlang=en&count=30&q=${eqi}`),
          probe("brave", `https://search.brave.com/search?q=${eq}`),
          probe("yt-oembed", "https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ&format=json"),
          probe("yt-watch", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
        ]);
        return Response.json(out);
      },
    },
  },
});
