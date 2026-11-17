import { useEffect, useRef, useState } from "react";
import { listVideos, type SavedVideo } from "@/lib/editor/library";

const when = (value: number) => new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const size = (bytes: number) => (bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`);

/** Videos saved from the editor, read from this browser's own storage. Not synced; clearing browser data removes them. */
export function SavedVideos() {
  const [videos, setVideos] = useState<SavedVideo[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState("");
  const urls = useRef(new Map<string, string>());

  useEffect(() => {
    let live = true;
    void listVideos().then((result) => {
      if (!live) return;
      if (result.ok) setVideos([...result.value].sort((a, b) => b.savedAt - a.savedAt));
      else { setError(result.error); setVideos([]); }
    });
    const held = urls.current;
    return () => { live = false; for (const url of held.values()) URL.revokeObjectURL(url); held.clear(); };
  }, []);

  const urlFor = (video: SavedVideo) => {
    let url = urls.current.get(video.id);
    if (!url) { url = URL.createObjectURL(video.blob); urls.current.set(video.id, url); }
    return url;
  };

  if (videos === null) return <div className="dk-empty">Loading your videos…</div>;
  if (!videos.length) return (
    <div className="dk-empty">
      {error ? `Saved videos can't be read on this browser right now (${error}).` : "Videos you save from the editor appear here."}
      <br />They are kept on this browser only. Nothing is pre-made for you.
    </div>
  );
  return (
    <div>
      <p style={{ fontSize: 13, margin: "0 0 12px" }}>Kept on this browser only. They don't sync to other devices, and clearing browser data removes them.</p>
      <div className="dk-g2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {videos.map((video) => (
          <div className="dk-panel" key={video.id} data-testid="saved-video">
            <div className="dk-label">{when(video.savedAt)}</div>
            <b style={{ wordBreak: "break-all" }}>{video.name}</b>
            <p style={{ fontSize: 13, margin: "6px 0 10px" }}>{video.format.toUpperCase()} · {size(video.size)} · {video.clipCount} clip{video.clipCount === 1 ? "" : "s"}</p>
            {open === video.id
              ? <video controls playsInline src={urlFor(video)} style={{ width: "100%", maxHeight: 360, background: "#000" }} />
              : <button type="button" className="dk-btn" onClick={() => setOpen(video.id)}>Play</button>}
            {" "}<a className="dk-link" href={urlFor(video)} download={video.name}>Download</a>
          </div>
        ))}
      </div>
    </div>
  );
}
