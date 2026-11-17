import { createFileRoute } from "@tanstack/react-router";

// Temporary read-only diagnostic.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
export const Route = createFileRoute("/api/ai/refprobe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams.get("q") ?? "how to study for exams";
        const g = async (u: string) => (await fetch(u, { headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" } })).text();
        const web = await g(`https://www.bing.com/search?setlang=en&count=30&q=${encodeURIComponent("youtube " + q)}`);
        const vid = await g(`https://www.bing.com/videos/search?setlang=en&q=${encodeURIComponent(q + " youtube")}`);
        const i = vid.indexOf("murl");
        const k = web.indexOf("b_algo");
        return Response.json({
          webLen: web.length, algo: (web.match(/b_algo/g) ?? []).length, webAt: web.slice(k, k + 900),
          vidLen: vid.length, murlCount: (vid.match(/murl/g) ?? []).length, vidAt: vid.slice(Math.max(0, i - 100), i + 700),
          ytInWeb: (web.match(/youtube\.com/g) ?? []).length,
        });
      },
    },
  },
});
