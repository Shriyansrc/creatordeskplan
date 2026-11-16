import { useEffect, useState } from "react";
import type { PlanResult } from "@/lib/ai/contracts";
import { useServiceStatus } from "@/lib/ai/client";
import type { ReferenceVideo, ReferencesResult } from "@/lib/references/contracts";
import { nicheLabel, type StudioShared } from "@/lib/creator-shared";
import { usePersistentState } from "@/lib/use-persistent-state";
import { PlatformMark } from "./platform-mark";

type LinkRef = {
  id: string;
  platform: "ig" | "x";
  url: string;
  views: string;
  likes: string;
  note: string;
};

export function ReferencePanel({ st, pains }: { st: StudioShared; pains: string[][] }) {
  const status = useServiceStatus();
  const [plan] = usePersistentState<PlanResult | null>("plan", null);
  const [ideas] = usePersistentState<Record<number, string>>("ideas", {});
  const prefill = ideas[st.day] ?? plan?.topics.find((topic) => topic.day === st.day)?.title ?? st.topic;
  const [idea, setIdea] = useState(prefill);
  useEffect(() => setIdea(prefill), [prefill]);
  const [mode, setMode] = useState<"yt" | "ig" | "x">("yt");
  const [results, setResults] = useState<ReferenceVideo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = usePersistentState<ReferenceVideo[]>("saved-references", []);
  const [links, setLinks] = usePersistentState<LinkRef[]>("reference-links", []);
  const [draft, setDraft] = useState({ url: "", views: "", likes: "", note: "" });
  const connected = status.state === "ready" && status.references;
  const niche = nicheLabel(st);

  const search = async () => {
    setLoading(true);
    setError("");
    setResults(null);
    try {
      const response = await fetch("/api/ai/references", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idea,
          niche,
          audience: pains.map((pain) => pain[0]).join("; "),
          platform: "yt",
          count: 8,
        }),
      });
      const body = (await response.json()) as {
        connected?: boolean;
        reason?: string;
        error?: string;
        data?: ReferencesResult;
      };
      if (body.connected === false)
        throw new Error(body.reason ?? "Reference search is not connected (no YouTube API key)");
      if (!response.ok || body.error || !body.data)
        throw new Error(body.error ?? `Reference search failed with HTTP ${response.status}`);
      setResults(body.data.videos);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reference search failed");
    } finally {
      setLoading(false);
    }
  };
  const addLink = () => {
    let valid = false;
    try {
      const host = new URL(draft.url).hostname;
      valid = mode === "ig" ? /(^|\.)instagram\.com$/.test(host) : /(^|\.)(x|twitter)\.com$/.test(host);
    } catch {
      valid = false;
    }
    if (!valid || mode === "yt") {
      setError(`Paste a full ${mode === "ig" ? "instagram.com" : "x.com"} link.`);
      return;
    }
    setError("");
    setLinks([...links, { id: `${Date.now()}`, platform: mode, ...draft }]);
    setDraft({ url: "", views: "", likes: "", note: "" });
  };

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="lab" style={{ margin: 0 }}>
          Find reference videos
        </div>
        <span className="sp" />
        <span className={"tg " + (connected ? "r" : "n")}>
          {status.state === "checking" ? "Checking" : connected ? "Connected: YouTube Data API" : "Not connected"}
        </span>
      </div>
      <label className="lab" htmlFor="ref-idea">
        Your idea
      </label>
      <input id="ref-idea" className="field" value={idea} onChange={(event) => setIdea(event.target.value)} />
      <div className="row" style={{ flexWrap: "wrap", margin: "10px 0" }}>
        {(["yt", "ig", "x"] as const).map((item) => (
          <button
            key={item}
            className={"chip" + (mode === item ? " on" : "")}
            aria-pressed={mode === item}
            onClick={() => {
              setMode(item);
              setError("");
            }}
          >
            {item === "yt" ? "YouTube search" : item === "ig" ? "Instagram link" : "X link"}
          </button>
        ))}
      </div>
      {mode === "yt" ? (
        <>
          {status.state === "ready" && !connected && (
            <p className="note">
              Reference search is not connected (no YouTube API key). Link mode for Instagram and X still works.
            </p>
          )}
          <button className="btn" disabled={!connected || loading || idea.trim().length < 2} onClick={search}>
            {loading ? "Searching YouTube…" : results ? "Search again" : "Find reference videos"}
          </button>
          {error && (
            <div className="notice" role="alert">
              {error}{" "}
              <button className="btn s g" onClick={search} disabled={!connected || loading}>
                Retry
              </button>
            </div>
          )}
          {results && !results.length && <p className="note">YouTube returned no videos for this idea.</p>}
          {results && results.length > 0 && (
            <div className="stack" style={{ marginTop: 12 }}>
              {results.map((video) => (
                <ReferenceCard
                  key={video.id}
                  video={video}
                  saved={saved.some((item) => item.id === video.id)}
                  onSave={() =>
                    setSaved(
                      saved.some((item) => item.id === video.id)
                        ? saved.filter((item) => item.id !== video.id)
                        : [...saved, video],
                    )
                  }
                />
              ))}
            </div>
          )}
          {results && (
            <p className="note">
              Ranked by how closely the title and description match your idea, then by views. Numbers come from YouTube
              at search time.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="note">
            {mode === "ig" ? "Instagram" : "X"} has no free official search API, so Creator Desk does not search or
            scrape it. Paste a link and type the numbers you see.
          </p>
          <div className="stack">
            <input
              className="field"
              aria-label="Link to analyze"
              placeholder={mode === "ig" ? "https://www.instagram.com/reel/…" : "https://x.com/…/status/…"}
              value={draft.url}
              onChange={(event) => setDraft({ ...draft, url: event.target.value })}
            />
            <div className="row">
              <input
                className="field"
                aria-label="Views, entered by you"
                placeholder="Views"
                inputMode="numeric"
                value={draft.views}
                onChange={(event) => setDraft({ ...draft, views: event.target.value.replace(/[^\d]/g, "") })}
              />
              <input
                className="field"
                aria-label="Likes, entered by you"
                placeholder="Likes"
                inputMode="numeric"
                value={draft.likes}
                onChange={(event) => setDraft({ ...draft, likes: event.target.value.replace(/[^\d]/g, "") })}
              />
            </div>
            <input
              className="field"
              aria-label="What to adapt"
              placeholder="What you want to adapt"
              value={draft.note}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
            />
            <button className="btn s" onClick={addLink} disabled={!draft.url.trim()}>
              Save link to plan
            </button>
          </div>
          {error && (
            <div className="notice" role="alert">
              {error}
            </div>
          )}
        </>
      )}
      {(saved.length > 0 || links.length > 0) && (
        <div style={{ marginTop: 14 }}>
          <div className="lab">Saved to plan</div>
          <div className="stack">
            {saved.map((video) => (
              <ReferenceCard
                key={video.id}
                video={video}
                saved
                onSave={() => setSaved(saved.filter((item) => item.id !== video.id))}
              />
            ))}
            {links.map((link) => (
              <div className="card row" key={link.id}>
                <PlatformMark platform={link.platform} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a href={link.url} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all" }}>
                    {link.url}
                  </a>
                  <div style={{ fontSize: 13 }}>
                    {link.views ? `${Number(link.views).toLocaleString()} views` : "Views not entered"} ·{" "}
                    {link.likes ? `${Number(link.likes).toLocaleString()} likes` : "Likes not entered"} · entered by you
                  </div>
                  {link.note && <div style={{ fontSize: 13 }}>{link.note}</div>}
                </div>
                <button className="btn s g" onClick={() => setLinks(links.filter((item) => item.id !== link.id))}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReferenceCard({ video, saved, onSave }: { video: ReferenceVideo; saved: boolean; onSave: () => void }) {
  return (
    <div className="card row" style={{ alignItems: "flex-start" }}>
      <a href={video.url} target="_blank" rel="noreferrer" aria-label={`Play ${video.title} on YouTube`}>
        <img
          src={video.thumbnail}
          alt=""
          width={120}
          height={68}
          style={{ width: 120, height: 68, objectFit: "cover", borderRadius: 8 }}
          loading="lazy"
        />
      </a>
      <div style={{ flex: 1, minWidth: 0 }}>
        <a href={video.url} target="_blank" rel="noreferrer">
          <b>{video.title}</b>
        </a>
        <div style={{ fontSize: 13 }}>
          {video.channel} · {video.viewCount.toLocaleString()} views ·{" "}
          {new Date(video.publishedAt).toLocaleDateString()}
        </div>
        <div className="note">{video.why}</div>
      </div>
      <button className="btn s g" onClick={onSave} aria-pressed={saved}>
        {saved ? "Remove from plan" : "Save to plan"}
      </button>
    </div>
  );
}
