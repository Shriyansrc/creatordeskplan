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

function decodeBing(href: string): string {
  try {
    const u = new URL(href.replace(/&amp;/g, "&"));
    const p = u.searchParams.get("u");
    if (p && p.startsWith("a1")) {
      const b = p.slice(2).replace(/-/g, "+").replace(/_/g, "/");
      return atob(b + "=".repeat((4 - (b.length % 4)) % 4));
    }
  } catch { /* fall through */ }
  return href;
}

async function bingDeep(label: string, url: string) {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" } });
    const t = await r.text();
    const hrefs = [...t.matchAll(/<a[^>]+href="(https?:\/\/www\.bing\.com\/ck\/a[^"]+)"/g)].map((m) => decodeBing(m[1]));
    const direct = [...t.matchAll(/<h2[^>]*><a[^>]+href="(https?:[^"]+)"/g)].map((m) => m[1]);
    const murl = [...t.matchAll(/&quot;murl&quot;:&quot;(https?:[^&]+?)&quot;/g)].map((m) => m[1]);
    const turl = [...t.matchAll(/&quot;turl&quot;:&quot;(https?:[^&]+?)&quot;/g)].map((m) => m[1].slice(0, 90));
    return { label, status: r.status, bytes: t.length, decoded: hrefs.filter((h) => /youtube|instagram|tiktok|linkedin|x\.com|twitter/.test(h)).slice(0, 8), direct: direct.slice(0, 5), murl: murl.slice(0, 5), turl: turl.slice(0, 3), ckCount: hrefs.length };
  } catch (e) { return { label, error: e instanceof Error ? e.message : "failed" }; }
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
        const deep = await Promise.all([
          bingDeep("bing-web-yt", `https://www.bing.com/search?setlang=en&count=30&q=${eq}`),
          bingDeep("bing-videos", `https://www.bing.com/videos/search?setlang=en&q=${encodeURIComponent(q + " youtube")}`),
          bingDeep("bing-web-ig", `https://www.bing.com/search?setlang=en&count=30&q=${eqi}`),
        ]);
        return Response.json({ out: out.map((o) => ({ name: o.name, status: "status" in o ? o.status : null, err: "error" in o ? o.error : null })), deep });
      },
    },
  },
});
