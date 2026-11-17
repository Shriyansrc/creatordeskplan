// Live research sources. Every item here comes from a public endpoint at request time.
// Nothing is invented: when an endpoint fails or returns nothing, it is simply absent.
export type ResearchSource = { id: number; site: string; title: string; url: string; snippet: string };

type Raw = Omit<ResearchSource, "id">;

async function getJson(url: string, ms = 6000): Promise<unknown> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json", "user-agent": "CreatorDesk/1.0 (research lookup)" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

const clean = (s: unknown, n = 240) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim().slice(0, n);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rec = (v: unknown): any => (v && typeof v === "object" ? v : {});

async function suggest(q: string, yt: boolean): Promise<Raw[]> {
  const u = `https://suggestqueries.google.com/complete/search?client=firefox${yt ? "&ds=yt" : ""}&q=${encodeURIComponent(q)}`;
  const j = arr(await getJson(u));
  const phrases = arr(j[1]).map((x) => clean(x, 120)).filter(Boolean).slice(0, 10);
  if (!phrases.length) return [];
  return [{
    site: yt ? "YouTube search suggestions" : "Google search suggestions",
    title: `What people type after "${q}"`,
    url: yt ? `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` : `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    snippet: phrases.join(" | "),
  }];
}

async function reddit(q: string): Promise<Raw[]> {
  const j = rec(await getJson(`https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=relevance&t=year&limit=8&raw_json=1`));
  return arr(rec(j.data).children).map((c) => rec(rec(c).data)).filter((d) => d.title && d.permalink).slice(0, 6).map((d) => ({
    site: `Reddit r/${clean(d.subreddit, 40)}`,
    title: clean(d.title, 200),
    url: `https://www.reddit.com${String(d.permalink)}`,
    snippet: `${Number(d.num_comments) || 0} comments, ${Number(d.score) || 0} upvotes. ${clean(d.selftext, 200)}`.trim(),
  }));
}

// kept for reference, not used: Hacker News is tech-only and added noise for most niches.
export async function hackerNews(q: string): Promise<Raw[]> {
  const j = rec(await getJson(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=6`));
  return arr(j.hits).map(rec).filter((h) => h.title && h.objectID).slice(0, 5).map((h) => ({
    site: "Hacker News",
    title: clean(h.title, 200),
    url: `https://news.ycombinator.com/item?id=${String(h.objectID)}`,
    snippet: `${Number(h.points) || 0} points, ${Number(h.num_comments) || 0} comments.`,
  }));
}

async function wikipedia(q: string): Promise<Raw[]> {
  const j = rec(await getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=3&format=json&origin=*`));
  return arr(rec(j.query).search).map(rec).filter((s) => s.title).slice(0, 3).map((s) => ({
    site: "Wikipedia",
    title: clean(s.title, 120),
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(s.title).replace(/ /g, "_"))}`,
    snippet: clean(s.snippet, 260),
  }));
}

export type SourceReport = { sources: ResearchSource[]; checked: { site: string; ok: boolean; count: number }[] };

export async function gatherSources(topic: string, niche: string): Promise<SourceReport> {
  const terms = Array.from(new Set([niche, topic].map((x) => x.trim().slice(0, 100)).filter((x) => x.length > 1)));
  const jobs: { site: string; run: () => Promise<Raw[]> }[] = [];
  for (const q of terms) {
    jobs.push({ site: `YouTube suggestions: ${q}`, run: () => suggest(q, true) });
    jobs.push({ site: `Google suggestions: ${q}`, run: () => suggest(q, false) });
    jobs.push({ site: `Reddit: ${q}`, run: () => reddit(q) });
    for (const pre of ["how to ", "why ", "mistakes ", "best "]) {
      const qq = pre === "mistakes " ? `${q} mistakes` : `${pre}${q}`;
      jobs.push({ site: `YouTube questions: ${qq}`, run: () => suggest(qq, true) });
    }
    jobs.push({ site: `Wikipedia: ${q}`, run: () => wikipedia(q) });
  }
  const settled = await Promise.allSettled(jobs.map((j) => j.run()));
  const seen = new Set<string>();
  const out: Raw[] = [];
  const checked = settled.map((s, i) => {
    const items = s.status === "fulfilled" ? s.value : [];
    for (const it of items) if (!seen.has(it.url)) { seen.add(it.url); out.push(it); }
    return { site: jobs[i]!.site, ok: s.status === "fulfilled" && items.length > 0, count: items.length };
  });
  return { sources: out.slice(0, 40).map((s, i) => ({ id: i + 1, ...s })), checked };
}
