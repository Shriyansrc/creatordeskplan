import { useEffect, useState } from "react";
import type { PlanResult } from "@/lib/ai/contracts";
import type { WebVideo, WebPlatform } from "@/lib/references/web";
import { nicheLabel, type StudioShared } from "@/lib/creator-shared";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useDesk } from "@/desk/store";
import { PlatformMark } from "./platform-mark";

type Found = WebVideo & { why?: string };
type Section = { loading: boolean; error: string; supported: boolean; note: string; videos: Found[]; cached: boolean; done: boolean };
const EMPTY: Section = { loading: false, error: "", supported: true, note: "", videos: [], cached: false, done: false };
const NAMES: Record<WebPlatform, string> = { yt: "YouTube", ig: "Instagram", li: "LinkedIn", x: "X" };
const SITE: Record<WebPlatform, string> = { yt: "youtube.com", ig: "instagram.com/reel", li: "linkedin.com/posts", x: "x.com" };

export function ReferencePanel({ st, pains }: { st: StudioShared; pains: string[][] }) {
  const desk = useDesk();
  const platforms = (desk.profile.platforms.length ? desk.profile.platforms : (["yt"] as WebPlatform[])) as WebPlatform[];
  const [plan] = usePersistentState<PlanResult | null>("plan", null);
  const [ideas] = usePersistentState<Record<number, string>>("ideas", {});
  const prefill = ideas[st.day] ?? plan?.topics.find((topic) => topic.day === st.day)?.title ?? st.topic;
  const [idea, setIdea] = useState(prefill);
  useEffect(() => setIdea(prefill), [prefill]);
  const [sections, setSections] = useState<Partial<Record<WebPlatform, Section>>>({});
  const [saved, setSaved] = usePersistentState<Found[]>("saved-refs2", []);
  const niche = nicheLabel(st);
  const busy = platforms.some((p) => sections[p]?.loading);

  const run = async (platform: WebPlatform) => {
    setSections((s) => ({ ...s, [platform]: { ...EMPTY, loading: true } }));
    try {
      const response = await fetch("/api/ai/references", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea, niche, platform }),
      });
      const body = (await response.json()) as { error?: string; supported?: boolean; note?: string; videos?: Found[]; cached?: boolean };
      if (!response.ok || body.error) throw new Error(body.error ?? `Search failed with HTTP ${response.status}`);
      setSections((s) => ({ ...s, [platform]: { loading: false, error: "", supported: body.supported !== false, note: body.note ?? "", videos: body.videos ?? [], cached: !!body.cached, done: true } }));
    } catch (cause) {
      setSections((s) => ({ ...s, [platform]: { ...EMPTY, done: true, error: cause instanceof Error ? cause.message : "Search failed" } }));
    }
  };
  const runAll = async () => {
    for (const p of platforms) await run(p);
  };
  const toggle = (v: Found) => setSaved(saved.some((x) => x.url === v.url) ? saved.filter((x) => x.url !== v.url) : [...saved, v]);

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="lab" style={{ margin: 0 }}>Find references</div>
        <span className="sp" />
        <span className="tg n">Built-in web search</span>
      </div>
      <label className="lab" htmlFor="ref-idea">Your idea</label>
      <input id="ref-idea" className="field" value={idea} onChange={(event) => setIdea(event.target.value)} />
      <p className="note" style={{ margin: "10px 0" }}>
        Searches selected platforms for YouTube videos and related LinkedIn posts: {platforms.map((p) => NAMES[p]).join(", ")}. No key or pasted links. LinkedIn video playback is not verified. Instagram and X discovery are unresolved. Results are not ranked by performance.
      </p>
      <button className="btn" disabled={busy || idea.trim().length < 2} onClick={() => void runAll()}>
        {busy ? "Searching…" : platforms.some((p) => sections[p]?.done) ? "Search again" : "Find references"}
      </button>
      {platforms.map((p) => {
        const sec = sections[p];
        if (!sec) return null;
        const google = `https://www.google.com/search?q=${encodeURIComponent(`site:${SITE[p]} ${idea}`)}`;
        return (
          <div key={p} style={{ marginTop: 16 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <PlatformMark platform={p} />
              <b>{NAMES[p]}</b>
              {sec.cached && <span className="note">saved result from earlier</span>}
            </div>
            {sec.loading && <p className="note">Searching {NAMES[p]}…</p>}
            {sec.error && (
              <div className="notice" role="alert">
                {sec.error} <button className="btn s g" onClick={() => void run(p)} disabled={sec.loading}>Retry</button>
              </div>
            )}
            {sec.done && !sec.error && !sec.supported && <p className="note">{sec.note}</p>}
            {sec.done && !sec.error && sec.supported && !sec.videos.length && <p className="note">{sec.note || `No ${NAMES[p]} results for this idea.`}</p>}
            <div className="stack">
              {sec.videos.map((v) => (
                <RefCard key={v.url} v={v} saved={saved.some((x) => x.url === v.url)} onSave={() => toggle(v)} />
              ))}
            </div>
            {sec.done && !sec.loading && (
              <p className="note" style={{ marginTop: 8 }}>
                <a href={google} target="_blank" rel="noreferrer">Open Google results for {NAMES[p]} on this idea</a> (opens in your browser).
              </p>
            )}
          </div>
        );
      })}
      {saved.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="lab">Saved to plan</div>
          <div className="stack">
            {saved.map((v) => (
              <RefCard key={v.url} v={v} saved onSave={() => toggle(v)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RefCard({ v, saved, onSave }: { v: Found; saved: boolean; onSave: () => void }) {
  const label = v.platform === "yt" ? "video" : "post (video not verified)";
  return (
    <div className="card row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
      <a href={v.url} target="_blank" rel="noreferrer" aria-label={`Open this ${label} on ${NAMES[v.platform]}`}>
        {v.thumbnail ? (
          <img src={v.thumbnail} alt="" width={120} height={68} style={{ width: 120, height: 68, objectFit: "cover", borderRadius: 8 }} loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span style={{ display: "grid", placeItems: "center", width: 120, height: 68, borderRadius: 8, background: "#e5eaf2", fontSize: 13, color: "#46556b", textAlign: "center" }}>No thumbnail from {NAMES[v.platform]}</span>
        )}
      </a>
      <div style={{ flex: 1, minWidth: 0 }}>
        <a href={v.url} target="_blank" rel="noreferrer"><b>{v.title}</b></a>
        <div style={{ fontSize: 13 }}>
          {[v.author, v.views !== null ? `${v.views.toLocaleString()} views` : "views not available", v.likes !== null ? `${v.likes.toLocaleString()} likes` : ""].filter(Boolean).join(" · ")}
        </div>
        <div className="note">{v.platform !== "yt" ? "Post only. Video playback not verified. " : ""}{v.why ?? v.note}</div>
      </div>
      <button className="btn s g" onClick={onSave} aria-pressed={saved}>{saved ? "Remove from plan" : "Save to plan"}</button>
    </div>
  );
}
