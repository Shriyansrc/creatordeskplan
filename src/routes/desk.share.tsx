import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PlatLogo } from "@/desk/ui";
import { PLATFORM_COPY, useDesk } from "@/desk/store";
import { getSessionExport } from "@/lib/editor/session-store";
import type { Platform } from "@/lib/ai/contracts";

export const Route = createFileRoute("/desk/share")({ component: Share });

const UPLOAD: Record<Platform, string> = { ig: "https://www.instagram.com/", yt: "https://studio.youtube.com/", li: "https://www.linkedin.com/feed/", x: "https://x.com/compose/post" };

function Share() {
  const d = useDesk();
  const [id, setId] = useState(Object.keys(d.scripts)[0] ?? "");
  const [copied, setCopied] = useState("");
  const sc = d.scripts[id]?.data;
  const file = getSessionExport();
  const caption = sc ? (sc.caption ? `${sc.caption}\n\n${sc.hashtags.join(" ")}` : `${sc.hook}\n\n${sc.cta}\n\n${sc.hashtags.join(" ")}`) : "";
  const copy = async (t: string, k: string) => { try { await navigator.clipboard.writeText(t); setCopied(k); } catch { setCopied(""); } };
  return (
    <>
      <h1>Share</h1>
      <p style={{ fontSize: 20, margin: "10px 0 20px" }}>You post each video yourself, on each platform. Nothing is posted for you.</p>
      <div className="dk-g2" style={{ gap: 22, alignItems: "start" }}>
        <div className="dk-panel">
          <div className="dk-label">Your video file</div>
          {file ? <><p style={{ marginBottom: 12 }}>{file.name}</p><a className="dk-btn" href={file.url} download={file.name}>Download video</a></> : <p>No exported video yet. Export one in the editor, then download it here.</p>}
        </div>
        <div className="dk-panel">
          <div className="dk-label">Caption</div>
          {Object.keys(d.scripts).length === 0 ? <p>Write a script in your plan to get a caption.</p> : (
            <>
              <select className="dk-field" value={id} onChange={(e) => setId(e.target.value)} aria-label="Choose a script" style={{ marginBottom: 12 }}>
                {Object.keys(d.scripts).map((k) => <option key={k} value={k}>{(d.plan?.data.topics.find((t) => t.id === k.replace(/@ref$/, ""))?.title ?? k.replace(/@ref$/, "")) + (k.endsWith("@ref") ? " (from reference)" : "")}</option>)}
              </select>
              <textarea className="dk-field" rows={6} readOnly value={caption} />
              <button type="button" className="dk-btn secondary" style={{ marginTop: 10 }} onClick={() => void copy(caption, "cap")}>{copied === "cap" ? "Copied" : "Copy caption"}</button>
            </>
          )}
        </div>
      </div>
      <p style={{ marginTop: 22 }}>Already posted? <Link to="/desk/results" style={{ color: "var(--blue)" }}>Add your real numbers</Link></p>
      <div className="dk-label" style={{ marginTop: 26 }}>Open your platforms</div>
      {d.profile.platforms.length === 0 ? <p>Choose platforms in Settings.</p> : (
        <div className="dk-list">{d.profile.platforms.map((p) => (
          <div key={p} className="dk-item dk-row" style={{ justifyContent: "space-between" }}>
            <span className="dk-row"><PlatLogo platform={p} /><b>{PLATFORM_COPY[p].name}</b></span>
            <a className="dk-btn secondary" href={UPLOAD[p]} target="_blank" rel="noreferrer">Open {PLATFORM_COPY[p].name}</a>
          </div>
        ))}</div>
      )}
    </>
  );
}
