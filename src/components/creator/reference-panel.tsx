import { useEffect, useState } from "react";
import type { PlanResult } from "@/lib/ai/contracts";
import type { WebVideo, WebPlatform } from "@/lib/references/web";
import { nicheLabel, type StudioShared } from "@/lib/creator-shared";
import { usePersistentState } from "@/lib/use-persistent-state";
import { useDesk } from "@/desk/store";
import { PlatformMark } from "./platform-mark";
import { supabase } from "@/integrations/supabase/client";
import { GoogleButton } from "./google-button";

type Found = WebVideo & { why?: string };
type Section = { loading: boolean; error: string; supported: boolean; note: string; videos: Found[]; unverified: Found[]; cached: boolean; done: boolean };
const EMPTY: Section = { loading: false, error: "", supported: true, note: "", videos: [], unverified: [], cached: false, done: false };
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
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [saved, setSaved] = usePersistentState<Found[]>("saved-refs2", []);
  const niche = nicheLabel(st);
  const busy = platforms.some((p) => sections[p]?.loading);

  const run = async (platform: WebPlatform, fresh = false) => {
    setSections((s) => ({ ...s, [platform]: { ...EMPTY, loading: true } }));
    try {
      const { data, error } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (error || !token) {
        setNeedsSignIn(true);
        throw new Error("Sign in to search references.");
      }
      setNeedsSignIn(false);
      const response = await fetch("/api/ai/references", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ idea, niche, platform, fresh }),
      });
      const body = (await response.json()) as { error?: string; supported?: boolean; note?: string; videos?: Found[]; unverified?: Found[]; cached?: boolean };
      if (response.status === 401) setNeedsSignIn(true);
      if (!response.ok || body.error) throw new Error(body.error ?? `Search failed with HTTP ${response.status}`);
      setSections((s) => ({ ...s, [platform]: { loading: false, error: "", supported: body.supported !== false, note: body.note ?? "", videos: body.videos ?? [], unverified: body.unverified ?? [], cached: !!body.cached, done: true } }));
    } catch (cause) {
      setSections((s) => ({ ...s, [platform]: { ...EMPTY, done: true, error: cause instanceof Error ? cause.message : "Search failed" } }));
    }
  };
  const runAll = async () => {
    const fresh = platforms.some((p) => sections[p]?.done);
    for (const p of platforms) await run(p, fresh);
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
        Searches the selected platforms: {platforms.map((p) => NAMES[p]).join(", ")}. No key or pasted links. Links the platform blocks us from checking are listed separately as found in search, video not verified. X is not supported yet. Results are sorted by how well they match your idea, not by performance.
      </p>
      <button className="btn" disabled={busy || idea.trim().length < 2} onClick={() => void runAll()}>
        {busy ? "Searching…" : platforms.some((p) => sections[p]?.done) ? "Search again" : "Find references"}
      </button>
      {needsSignIn && <GoogleButton label="Sign in to search references" />}
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
                {sec.error} <button className="btn s g" onClick={() => void run(p, true)} disabled={sec.loading}>Search again</button>
              </div>
            )}
            {sec.done && !sec.error && !sec.supported && <p className="note">{sec.note}</p>}
            {sec.done && !sec.error && sec.supported && sec.note && <p className="note">{sec.note}</p>}
            <div className="stack">
              {sec.videos.map((v) => (
                <RefCard key={v.url} v={v} saved={saved.some((x) => x.url === v.url)} onSave={() => toggle(v)} />
              ))}
            </div>
            {sec.unverified.length > 0 && (
              <>
                <div className="lab" style={{ marginTop: 10 }}>Found in search, video not verified</div>
                <div className="stack">
                  {sec.unverified.map((v) => (
                    <RefCard key={v.url} v={v} saved={saved.some((x) => x.url === v.url)} onSave={() => toggle(v)} />
                  ))}
                </div>
              </>
            )}
            {sec.done && !sec.loading && (
              <p className="note" style={{ marginTop: 8 }}>
                Optional: <a href={google} target="_blank" rel="noreferrer">look on Google yourself</a>. These are not counted as found videos.
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
  const ok = v.verified === "platform";
  const label = ok ? "video" : "link";
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
          {[NAMES[v.platform], v.author || "creator unknown", v.views !== null ? `${v.views.toLocaleString()} views` : "views unknown", v.likes !== null ? `${v.likes.toLocaleString()} likes` : "likes unknown", "date unknown"].join(" · ")}
        </div>
        <div className="note">{ok ? "Confirmed video. " : "Found in search, video not verified. "}{v.why ?? v.note}</div>
        <div className="note" style={{ wordBreak: "break-all" }}>{v.url}</div>
      </div>
      <a className="btn s" href={v.url} target="_blank" rel="noreferrer">Open video</a>
      <button className="btn s g" onClick={onSave} aria-pressed={saved}>{saved ? "Remove from plan" : "Save to plan"}</button>
    </div>
  );
}

