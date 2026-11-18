// Keyless reference discovery. Server side only. Google and YouTube block server requests
// (HTTP 429 "unusual traffic"), so public web search pages that answer servers are used instead,
// and every hit is checked against the platform before it is shown.
export type WebPlatform = "yt" | "ig" | "li" | "x";

export type WebHit = { platform: WebPlatform; url: string; id: string; title: string; snippet: string; engine: string };
export type WebVideo = {
  platform: WebPlatform;
  url: string;
  title: string;
  author: string;
  thumbnail: string | null;
  views: number | null;
  likes: number | null;
  verified: "platform" | "search-only";
  engine: string;
  note: string;
};
export type EngineLog = { engine: string; platform: WebPlatform; ok: boolean; status: number | null; hits: number; error?: string };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const PLATFORM_QUERY: Record<WebPlatform, { site: string; words: string }> = {
  yt: { site: "youtube.com", words: "youtube" },
  ig: { site: "instagram.com", words: "instagram reel" },
  li: { site: "linkedin.com", words: "linkedin video post" },
  x: { site: "x.com", words: "x twitter video post" },
};

/** Return canonical url + id when the url is a single video/post page on the platform, else null. */
export function classify(raw: string): { platform: WebPlatform; url: string; id: string } | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.replace(/^(www|m)\./, "");
  const path = u.pathname;
  if (host === "youtube.com") {
    const v = u.searchParams.get("v");
    if (path === "/watch" && v && /^[\w-]{11}$/.test(v)) return { platform: "yt", url: `https://www.youtube.com/watch?v=${v}`, id: v };
    const s = path.match(/^\/shorts\/([\w-]{11})/);
    if (s) return { platform: "yt", url: `https://www.youtube.com/shorts/${s[1]!}`, id: s[1]! };
  }
  if (host === "youtu.be") {
    const m = path.match(/^\/([\w-]{11})/);
    if (m) return { platform: "yt", url: `https://www.youtube.com/watch?v=${m[1]!}`, id: m[1]! };
  }
  if (host === "instagram.com") {
    const m = path.match(/^\/(?:[\w.]+\/)?(reel|reels|p|tv)\/([\w-]{5,})/);
    if (m) return { platform: "ig", url: `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]!}/${m[2]!}/`, id: m[2]! };
  }
  if (host === "x.com" || host === "twitter.com") {
    const m = path.match(/^\/(\w{1,15})\/status\/(\d{5,25})/);
    if (m) return { platform: "x", url: `https://x.com/${m[1]!}/status/${m[2]!}`, id: m[2]! };
  }
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    if (/^\/(posts\/|feed\/update\/|video\/)/.test(path)) return { platform: "li", url: `https://www.linkedin.com${path}`.replace(/\/+$/, ""), id: path };
  }
  return null;
}

const entities = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const strip = (s: string) => entities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

function decodeBingHref(href: string): string {
  try {
    const u = new URL(entities(href));
    const p = u.searchParams.get("u");
    if (p && p.startsWith("a1")) {
      const b = p.slice(2).replace(/-/g, "+").replace(/_/g, "/");
      return atob(b + "=".repeat((4 - (b.length % 4)) % 4));
    }
  } catch { /* use as is */ }
  return entities(href);
}

async function getText(url: string, init: RequestInit = {}, ms = 7000): Promise<{ status: number; text: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal, headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9", ...(init.headers ?? {}) } });
    return { status: r.status, text: await r.text() };
  } finally { clearTimeout(timer); }
}

type Raw = { url: string; title: string; snippet: string };

function parseDdg(html: string): Raw[] {
  const out: Raw[] = [];
  const blocks = html.split(/<div class="[^"]*result results_links[^"]*"/).slice(1);
  for (const b of blocks) {
    const a = b.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    let url = entities(a[1]!);
    const m = url.match(/[?&]uddg=([^&]+)/);
    if (m) url = decodeURIComponent(m[1]!);
    else if (url.startsWith("//")) url = `https:${url}`;
    const sn = b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    out.push({ url, title: strip(a[2]!), snippet: sn ? strip(sn[1]!) : "" });
  }
  return out;
}

function parseBing(html: string): Raw[] {
  const byUrl = new Map<string, Raw>();
  for (const m of html.matchAll(/<a\b[^>]*?href="(https?:\/\/www\.bing\.com\/ck\/a[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = decodeBingHref(m[1]!);
    const title = strip(m[2]!);
    const prev = byUrl.get(url);
    if (!prev) byUrl.set(url, { url, title, snippet: "" });
    else if (!prev.title && title) prev.title = title;
  }
  return Array.from(byUrl.values());
}

function parseBingVideos(html: string): Raw[] {
  const out: Raw[] = [];
  for (const m of html.matchAll(/&quot;murl&quot;:&quot;(https?:[^&]+?)&quot;/g)) {
    out.push({ url: entities(m[1]!), title: "", snippet: "" });
  }
  return out;
}

export async function searchWeb(platform: WebPlatform, query: string, log: EngineLog[]): Promise<WebHit[]> {
  const q = PLATFORM_QUERY[platform];
  const engines: { name: string; run: () => Promise<{ status: number; raws: Raw[] }> }[] = [
    {
      name: "duckduckgo",
      run: async () => {
        const r = await getText("https://html.duckduckgo.com/html/", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `q=${encodeURIComponent(`site:${q.site} ${query}`)}` });
        return { status: r.status, raws: parseDdg(r.text) };
      },
    },
    {
      name: "bing",
      run: async () => {
        const r = await getText(`https://www.bing.com/search?setlang=en&count=30&q=${encodeURIComponent(`${q.words} ${query}`)}`);
        return { status: r.status, raws: parseBing(r.text) };
      },
    },
  ];
  if (platform === "yt") {
    engines.push({
      name: "bing-videos",
      run: async () => {
        const r = await getText(`https://www.bing.com/videos/search?setlang=en&q=${encodeURIComponent(`${query} youtube`)}`);
        return { status: r.status, raws: parseBingVideos(r.text) };
      },
    });
  }
  const seen = new Set<string>();
  const hits: WebHit[] = [];
  const settled = await Promise.allSettled(engines.map((e) => e.run()));
  settled.forEach((s, i) => {
    const name = engines[i]!.name;
    if (s.status === "rejected") {
      log.push({ engine: name, platform, ok: false, status: null, hits: 0, error: s.reason instanceof Error ? s.reason.message.slice(0, 80) : "failed" });
      return;
    }
    let n = 0;
    for (const raw of s.value.raws) {
      const c = classify(raw.url);
      if (!c || c.platform !== platform || seen.has(c.url)) continue;
      seen.add(c.url);
      hits.push({ platform, url: c.url, id: c.id, title: raw.title, snippet: raw.snippet, engine: name });
      n += 1;
    }
    log.push({ engine: name, platform, ok: s.value.status === 200, status: s.value.status, hits: n });
  });
  return hits;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const parseCount = (s: string): number | null => {
  const m = s.replace(/,/g, "").match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] ?? "").toUpperCase() as "K" | "M" | "B"] ?? 1;
  return Number.isFinite(n) ? Math.round(n * mult) : null;
};

const unverified = (hit: WebHit, why: string): WebVideo => ({ platform: hit.platform, url: hit.url, engine: hit.engine, title: hit.title, author: "", thumbnail: null, views: null, likes: null, verified: "search-only", note: `Found in search, video not verified. ${why}` });
const NAME: Record<WebPlatform, string> = { yt: "YouTube", ig: "Instagram", li: "LinkedIn", x: "X" };

/**
 * Check a hit against the platform itself. Only platform-confirmed fields are filled in.
 * Returns null only when the platform positively says the page does not exist (404/400/401 from oEmbed).
 * A blocked or failed check keeps the link as "search-only" instead of erasing a genuine search result.
 */
export async function verify(hit: WebHit): Promise<WebVideo | null> {
  const base = { platform: hit.platform, url: hit.url, engine: hit.engine };
  try {
    if (hit.platform === "yt") {
      const r = await getText(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(hit.url)}`, {}, 6000);
      if (r.status === 404 || r.status === 400 || r.status === 401) return null;
      if (r.status !== 200) return unverified(hit, `YouTube did not answer the check (HTTP ${r.status}).`);
      const j = JSON.parse(r.text) as Record<string, unknown>;
      if (typeof j["title"] !== "string") return unverified(hit, "YouTube returned no title.");
      let views: number | null = null;
      try {
        const w = await getText(hit.url, { headers: { cookie: "CONSENT=YES+1; SOCS=CAI" } }, 6000);
        const m = w.text.match(/"viewCount":"(\d+)"/) ?? w.text.match(/itemprop="interactionCount"\s+content="(\d+)"/);
        if (w.status === 200 && m) views = Number(m[1]);
      } catch { /* views stay unknown */ }
      return { ...base, title: j["title"], author: String(j["author_name"] ?? ""), thumbnail: `https://i.ytimg.com/vi/${hit.id}/hqdefault.jpg`, views, likes: null, verified: "platform", note: views === null ? "Confirmed on YouTube. View count could not be read." : "Confirmed on YouTube. View count read from the video page." };
    }
    if (hit.platform === "x") {
      const r = await getText(`https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(hit.url)}`, {}, 6000);
      if (r.status === 404) return null;
      if (r.status !== 200) return unverified(hit, `X did not answer the check (HTTP ${r.status}).`);
      const j = JSON.parse(r.text) as Record<string, unknown>;
      const text = strip(String(j["html"] ?? "")).replace(/\s*[\u2014-]\s*\S.*$/, "");
      return { ...base, title: (text || hit.title).slice(0, 200), author: String(j["author_name"] ?? ""), thumbnail: null, views: null, likes: null, verified: "search-only", note: "Post exists on X, but X does not say whether it contains a video." };
    }
    if (hit.platform === "ig" || hit.platform === "li") {
      const r = await getText(hit.url, { headers: { "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" } }, 6000);
      if (r.status !== 200) return unverified(hit, `${NAME[hit.platform]} blocked the server check (HTTP ${r.status}).`);
      const og = (p: string) => { const m = r.text.match(new RegExp(`<meta[^>]+property="og:${p}"[^>]+content="([^"]*)"`, "i")) ?? r.text.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="og:${p}"`, "i")); return m ? entities(m[1]!) : ""; };
      const desc = og("description");
      const likes = /([\d.,]+[KMB]?)\s+likes?/i.exec(desc);
      const hasVideo = !!og("video") || !!og("video:url") || /video/i.test(og("type")) || /"@type"\s*:\s*"VideoObject"/.test(r.text);
      const title = (og("title") || hit.title).slice(0, 200);
      const author = hit.platform === "li" ? (/^(.+?) on LinkedIn/i.exec(og("title"))?.[1] ?? "") : "";
      if (!hasVideo) return { ...unverified(hit, `The ${NAME[hit.platform]} page opened but did not show a video.`), title, author, thumbnail: og("image") || null };
      return { ...base, title, author, thumbnail: og("image") || null, views: null, likes: likes ? parseCount(likes[1]!) : null, verified: "platform", note: `Video confirmed on the ${NAME[hit.platform]} page.` };
    }
  } catch {
    return unverified(hit, `The ${NAME[hit.platform]} check failed or timed out.`);
  }
  return null;
}

export { num };
