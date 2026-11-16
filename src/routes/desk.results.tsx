import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PLATFORM_COPY, patchDesk, useDesk } from "@/desk/store";
import type { Platform } from "@/lib/ai/contracts";

export const Route = createFileRoute("/desk/results")({ component: Results });

function Results() {
  const d = useDesk();
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState<Platform | "">("");
  const [views, setViews] = useState("");
  const [saves, setSaves] = useState("");
  const [shares, setShares] = useState("");
  const ok = title.trim().length > 1 && platform !== "" && views !== "";
  const add = () => {
    if (!ok) return;
    patchDesk({ results: [{ id: `${Date.now()}`, title: title.trim(), platform, views: Number(views) || 0, saves: Number(saves) || 0, shares: Number(shares) || 0, at: new Date().toISOString() }, ...d.results] });
    setTitle(""); setViews(""); setSaves(""); setShares(""); setPlatform("");
  };
  const best = d.results.slice().sort((a, b) => b.saves + b.shares - (a.saves + a.shares))[0];
  return (
    <>
      <h1>See what worked</h1>
      <p style={{ fontSize: 20, margin: "10px 0 20px", maxWidth: 680 }}>Your real numbers, once you have posted. Connected-account stats are not built, so you type them in from each platform. Only what you enter shows here.</p>
      <div className="dk-panel" style={{ marginBottom: 22 }}>
        <div className="dk-label">Add a posted video</div>
        <div className="dk-g2" style={{ gap: 12 }}>
          <input className="dk-field" placeholder="Video title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Video title" />
          <select className="dk-field" value={platform} onChange={(e) => setPlatform(e.target.value as Platform | "")} aria-label="Platform">
            <option value="">Platform</option>
            {(Object.keys(PLATFORM_COPY) as Platform[]).map((p) => <option key={p} value={p}>{PLATFORM_COPY[p].name}</option>)}
          </select>
          <input className="dk-field" inputMode="numeric" placeholder="Views" value={views} onChange={(e) => setViews(e.target.value.replace(/\D/g, ""))} aria-label="Views" />
          <input className="dk-field" inputMode="numeric" placeholder="Saves" value={saves} onChange={(e) => setSaves(e.target.value.replace(/\D/g, ""))} aria-label="Saves" />
          <input className="dk-field" inputMode="numeric" placeholder="Shares" value={shares} onChange={(e) => setShares(e.target.value.replace(/\D/g, ""))} aria-label="Shares" />
        </div>
        <button type="button" className="dk-btn" style={{ marginTop: 14 }} disabled={!ok} onClick={add}>Save these numbers</button>
      </div>
      {d.results.length === 0 ? (
        <div className="dk-empty"><b>Nothing posted yet</b>Post your first video and enter its views, saves and shares. No demo numbers, ever.</div>
      ) : (
        <div className="dk-list">
          {best && <div className="dk-note"><b>Most saved and shared so far:</b> {best.title} on {PLATFORM_COPY[best.platform].name}. Your next plan should lean this way, based on only {d.results.length} video{d.results.length === 1 ? "" : "s"} you entered.</div>}
          {d.results.map((r) => (
            <div key={r.id} className="dk-item dk-row" style={{ justifyContent: "space-between" }}>
              <div><h3>{r.title}</h3><p>{PLATFORM_COPY[r.platform].name}</p></div>
              <div style={{ textAlign: "right", fontSize: 15 }}>{r.views.toLocaleString()} views<br />{r.saves.toLocaleString()} saves · {r.shares.toLocaleString()} shares</div>
              <button type="button" className="dk-link" onClick={() => patchDesk({ results: d.results.filter((x) => x.id !== r.id) })}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
