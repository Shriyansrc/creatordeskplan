import { createFileRoute } from "@tanstack/react-router";

/** Reads public oEmbed details (no key, no paid provider) for YouTube and X links only. Instagram offers no keyless reading. */
const YT = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);
const X = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"]);

const HOPS = new Set(["publish.twitter.com", "publish.x.com", "www.youtube.com", "youtube.com", "x.com", "twitter.com"]);

/** Follows at most two redirects, and only to the same trusted hosts over https. */
async function safeFetch(first: string): Promise<Response> {
  let url = first;
  for (let hop = 0; hop < 3; hop++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(7000), redirect: "manual", headers: { accept: "application/json" } });
    if (res.status < 300 || res.status >= 400) return res;
    const loc = res.headers.get("location");
    if (!loc) throw new Error("redirect without location");
    const next = new URL(loc, url);
    if (next.protocol !== "https:" || !HOPS.has(next.hostname)) throw new Error("redirect to untrusted host");
    url = next.toString();
  }
  throw new Error("too many redirects");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function plain(html: string) {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&mdash;/g, "-").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+\n/g, "\n").trim();
}

export const Route = createFileRoute("/api/link-meta")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let link = "";
        try {
          link = String(((await request.json()) as { link?: string }).link ?? "").trim();
        } catch {
          return json({ ok: false, reason: "Send a link." }, 400);
        }
        let u: URL;
        try {
          u = new URL(link);
        } catch {
          return json({ ok: false, reason: "That does not look like a link." }, 400);
        }
        if (u.protocol !== "https:") return json({ ok: false, reason: "Use an https link." }, 400);
        let endpoint: string;
        if (YT.has(u.hostname)) endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u.toString())}`;
        else if (X.has(u.hostname)) endpoint = `https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(u.toString())}`;
        else return json({ ok: false, reason: "Only YouTube and X links can be read. Paste the caption or transcript instead." }, 422);
        try {
          const res = await safeFetch(endpoint);
          if (!res.ok) return json({ ok: false, reason: "That link is private, removed or could not be read. Paste the text instead." }, 422);
          const d = (await res.json()) as { title?: string; author_name?: string; html?: string };
          const text = d.html ? plain(d.html) : "";
          return json({ ok: true, title: String(d.title ?? "").slice(0, 200), author: String(d.author_name ?? "").slice(0, 100), text: text.slice(0, 1500) });
        } catch {
          return json({ ok: false, reason: "Could not reach the platform just now. Paste the text instead." }, 502);
        }
      },
    },
  },
});
