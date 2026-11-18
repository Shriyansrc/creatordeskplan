import { generationHeaders } from "@/lib/ai/client";
import { useEffect, useState } from "react";
import { getDesk } from "@/desk/store";
import { applyRemote, fetchRemote, lastSyncedAt, pushLocal, type Remote } from "@/desk/sync";
import { Spinner } from "@/desk/ui";
import { errorText, learnStyle } from "@/desk/api";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_SECONDS, UPLOAD_MIME, toScriptReference, type Metric, type NeedsUpload, type ReferenceAnalysisResult, type ScriptReference } from "@/lib/reference-analysis/contracts";
import { usePersistentState } from "@/lib/use-persistent-state";
import type { StyleResult } from "@/lib/ai/contracts";

export function styleNotesOf(s: StyleResult | null): string | undefined {
  if (!s) return undefined;
  return `${s.name}. Tone: ${s.tone}. Rules: ${s.sentenceRules.join("; ")}. Uses: ${s.vocabulary.join(", ")}. Avoids: ${s.avoid.join("; ")}.`.slice(0, 1900);
}

export function StylePanel() {
  const [style, setStyle] = usePersistentState<StyleResult | null>("style", null);
  const [samples, setSamples] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      setStyle(await learnStyle({ samples, ...(desc.trim() ? { description: desc.trim() } : {}) }));
    } catch (e) {
      setErr(errorText(e));
    }
    setBusy(false);
  };
  return (
    <div className="dk-list" style={{ marginTop: 8 }}>
      <span className="dk-tag est">AI READS YOUR WRITING</span>
      {style ? (
        <div className="dk-item">
          <div className="dk-label">{style.name}</div>
          <p>{style.tone}</p>
          <ul>{style.sentenceRules.map((r) => <li key={r}>{r}</li>)}</ul>
          <p>Words you use: {style.vocabulary.join(", ")}</p>
          <p>Sounds like you: {style.sampleLine}</p>
          <p>New scripts on this screen use this style.</p>
          <button type="button" className="dk-chip" onClick={() => setStyle(null)}>Remove my style</button>
        </div>
      ) : (
        <>
          <label className="dk-item"><div className="dk-label">Paste 2 or 3 things you have written or said</div><textarea className="dk-field" rows={5} value={samples} onChange={(e) => setSamples(e.target.value)} placeholder="Captions, a script, a message to a friend..." /></label>
          <label className="dk-item"><div className="dk-label">Anything else about how you sound (optional)</div><input className="dk-field" value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
          <button type="button" className="dk-btn" disabled={busy || samples.trim().length < 40} onClick={() => void run()}>{busy ? <Spinner /> : null}Learn my style</button>
        </>
      )}
      {err && <p className="dk-err" role="alert">{err}</p>}
    </div>
  );
}

type RefOutcome = ReferenceAnalysisResult | NeedsUpload;
type SavedIdea = { title: string; angle: string; from: string; at: string };

function videoSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(v.duration) ? v.duration : null); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    v.src = url;
  });
}

const metricText = (label: string, m: Metric) => m.value === null ? `${label}: unknown (${m.source})` : `${label}: ${m.value.toLocaleString()} (${m.source}, read ${new Date(m.fetchedAt).toLocaleString()})`;

export function ReferenceAnalysis({ topic, niche, goal = "", audience = "", language = "", onScript, scriptBusy = false }: { topic: string; niche: string; goal?: string; audience?: string; language?: string; onScript?: (ref: ScriptReference) => void; scriptBusy?: boolean }) {
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = usePersistentState<RefOutcome | null>("ref-analysis2", null);
  const [savedIdeas, setSavedIdeas] = usePersistentState<SavedIdea[]>("ref-ideas", []);
  const run = async () => {
    if (busy) return;
    setErr("");
    if (file) {
      if (!(UPLOAD_MIME as readonly string[]).includes(file.type)) return setErr("That file type is not supported. Use an MP4, MOV or WebM video.");
      if (file.size > MAX_UPLOAD_BYTES) return setErr("That video is larger than 15 MB. Trim it or export a smaller copy.");
      const secs = await videoSeconds(file);
      if (secs !== null && secs > MAX_UPLOAD_SECONDS) return setErr("That video is longer than 3 minutes. Trim it to the part you want to learn from.");
    }
    setBusy(true);
    try {
      const fd = new FormData();
      if (file) fd.set("file", file); else fd.set("link", link.trim());
      Object.entries({ topic, niche, goal, audience, language }).forEach(([k, v]) => fd.set(k, v.slice(0, k === "audience" ? 500 : 300)));
      const headers = new Headers(await generationHeaders());
      headers.delete("content-type");
      const r = await fetch("/api/ai/reference-video", { method: "POST", headers, body: fd });
      const body = (await r.json().catch(() => ({}))) as RefOutcome & { error?: string };
      if (!r.ok || body.error) throw new Error(body.error ?? `Analysis failed with HTTP ${r.status}`);
      setRes(body);
    } catch (e) {
      setErr(errorText(e));
    }
    setBusy(false);
  };
  const r = res?.status === "analysed" ? res : null;
  const src = r ? (r.provenance.url ?? `Uploaded file ${r.provenance.fileName ?? ""}`) : "";
  return (
    <div className="dk-list" style={{ marginTop: 8 }}>
      <span className="dk-tag est">AI WATCHES THE VIDEO</span>
      <p>Paste one public YouTube video link, or upload a clip (MP4, MOV or WebM, up to 15 MB and 3 minutes). The AI watches and listens to it. Instagram, LinkedIn and X do not let apps read their videos, so for those, upload the file. The clip is sent once for analysis and is not stored.</p>
      <label className="dk-item"><div className="dk-label">Video link</div><input className="dk-field" value={link} disabled={!!file} placeholder="https://www.youtube.com/watch?v=..." onChange={(e) => setLink(e.target.value)} /></label>
      <label className="dk-item"><div className="dk-label">Or upload a video file</div><input type="file" accept="video/mp4,video/quicktime,video/webm" aria-label="Upload a video file" onChange={(e) => { setFile(e.target.files?.[0] ?? null); }} />{file && <button type="button" className="dk-chip" onClick={() => setFile(null)}>Use a link instead</button>}</label>
      <button type="button" className="dk-btn" disabled={busy || (!file && !link.trim())} onClick={() => void run()}>{busy ? <Spinner /> : null}Analyse</button>
      {err && <p className="dk-err" role="alert">{err}</p>}
      {res?.status === "needs_upload" && <p className="dk-err" role="status">{res.reason}</p>}
      {r && (
        <div className="dk-item">
          <div className="dk-label">What was read</div>
          <p><b>{r.mode === "video+audio" ? "Video and audio" : "Video only (no speech heard)"}</b>. {r.evidence}</p>
          <p style={{ fontSize: 14, overflowWrap: "anywhere" }}>Source: {src}{r.provenance.title ? ` · "${r.provenance.title}"` : ""}{r.provenance.creator ? ` · ${r.provenance.creator}` : ""}</p>
          <p style={{ fontSize: 14 }}>{metricText("Views", r.metrics.views)}. {metricText("Likes", r.metrics.likes)}. {metricText("Comments", r.metrics.comments)}. Performance: unknown, no comparable videos to judge against.</p>
          {r.warning && <p className="dk-err">{r.warning}</p>}
          <div className="dk-label">Opening hook</div><p>{r.observed.hook}</p>
          {r.observed.spokenPoints.length > 0 && <><div className="dk-label">Spoken points</div><ul>{r.observed.spokenPoints.map((x) => <li key={x}>{x}</li>)}</ul></>}
          {r.observed.onScreenText.length > 0 && <><div className="dk-label">On-screen text</div><ul>{r.observed.onScreenText.map((x) => <li key={x.at + x.text}>{x.at}: {x.text}</li>)}</ul></>}
          <div className="dk-label">Structure (approximate)</div><ol>{r.observed.structure.map((b) => <li key={b.start + b.beat}><b>{b.start} to {b.end}</b>: {b.beat}</li>)}</ol>
          <div className="dk-label">Visual and editing patterns</div><ul>{r.observed.visualPatterns.map((x) => <li key={x}>{x}</li>)}</ul>
          <div className="dk-label">Pacing</div><p>{r.observed.pacing}</p>
          <div className="dk-label">Fit with your topic</div><p>{r.observed.topicFit}</p>
          {r.observed.fitCaution && <p style={{ fontSize: 14 }}>Note: {r.observed.fitCaution}</p>}
          <div className="dk-label">Ideas for you, using this format</div>
          <ul>{r.observed.ideas.map((x) => (
            <li key={x.title}><b>{x.title}</b>: {x.angle}
              <div className="dk-row" style={{ flexWrap: "wrap", marginTop: 6 }}>
                <button type="button" className="dk-chip" disabled={savedIdeas.some((s) => s.title === x.title)} onClick={() => setSavedIdeas([...savedIdeas, { ...x, from: src, at: new Date().toISOString() }])}>{savedIdeas.some((s) => s.title === x.title) ? "Idea saved" : "Use this idea"}</button>
                {onScript && <button type="button" className="dk-chip" disabled={scriptBusy} onClick={() => onScript(toScriptReference(r, x))}>Write a script for this idea</button>}
              </div>
            </li>))}</ul>
          <div className="dk-label">Script direction</div><p>{r.observed.scriptDirection.hookPattern}</p><ol>{r.observed.scriptDirection.beats.map((x) => <li key={x}>{x}</li>)}</ol>{r.observed.scriptDirection.notes && <p>{r.observed.scriptDirection.notes}</p>}
          {r.observed.avoidCopying.length > 0 && <><div className="dk-label">Avoid copying</div><ul>{r.observed.avoidCopying.map((x) => <li key={x}>{x}</li>)}</ul></>}
          {onScript && <button type="button" className="dk-btn" disabled={scriptBusy} onClick={() => onScript(toScriptReference(r))}>{scriptBusy ? <Spinner /> : null}Write a script using this pattern</button>}
        </div>
      )}
      {savedIdeas.length > 0 && (
        <div className="dk-item"><div className="dk-label">Ideas you kept from references</div>
          <ul>{savedIdeas.map((x) => <li key={x.title}><b>{x.title}</b>: {x.angle} <span style={{ fontSize: 13, overflowWrap: "anywhere" }}>(pattern from {x.from})</span> <button type="button" className="dk-chip" onClick={() => setSavedIdeas(savedIdeas.filter((s) => s.title !== x.title))}>Remove</button></li>)}</ul>
        </div>
      )}
    </div>
  );
}

export function ListenButton({ text }: { text: string }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [type, setType] = useState("");
  const [err, setErr] = useState("");
  const run = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/ai/speech", { method: "POST", headers: await generationHeaders(), body: JSON.stringify({ text: text.slice(0, 1600), style: "clearly and naturally, like a friendly teacher", ...(getDesk().profile.language ? { language: getDesk().profile.language } : {}) }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Voice failed with HTTP ${res.status}`);
      }
      const blob = await res.blob();
      setType(blob.type);
      setUrl(URL.createObjectURL(blob));
    } catch (e) {
      setErr(errorText(e));
    }
    setBusy(false);
  };
  return (
    <div className="dk-item">
      <div className="dk-label">Hear your script</div>
      <p>AI reads the script aloud so you can check how it sounds. It is a practice reference, not your recording.</p>
      <button type="button" className="dk-btn" disabled={busy || text.trim().length < 2} onClick={() => void run()}>{busy ? <Spinner /> : null}Hear it read aloud</button>
      {url && <audio controls src={url} style={{ width: "100%", marginTop: 10 }} data-type={type} />}
      {err && <p className="dk-err" role="alert">{err}</p>}
    </div>
  );
}

export function SyncPanel({ userId }: { userId: string }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [remote, setRemote] = useState<Remote | undefined>(undefined);
  const refresh = async () => {
    const { remote: r, error } = await fetchRemote(userId);
    if (error) setMsg(`Could not reach your saved copy: ${error}`);
    else setRemote(r);
  };
  useEffect(() => { void refresh(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  const synced = lastSyncedAt();
  const remoteNewer = !!remote && (!synced || remote.updated_at > synced);
  const save = async () => {
    if (remoteNewer && !window.confirm("Your account has a newer saved copy than this browser last saw. Saving will replace it. Continue?")) return;
    setBusy(true);
    const e = await pushLocal(userId);
    setMsg(e ? `Not saved: ${e}` : "Saved to your account.");
    await refresh();
    setBusy(false);
  };
  const load = () => {
    if (!remote) return;
    if (getDesk().profile.setupDone && !window.confirm("This replaces the plans and style saved in this browser with the copy from your account. Continue?")) return;
    const e = applyRemote(remote);
    setMsg(e ?? "Loaded from your account.");
  };
  return (
    <div style={{ marginTop: 14 }}>
      <p style={{ fontSize: 15 }}>
        {remote === undefined ? "Checking your saved copy..." : remote ? `Saved copy on your account: ${new Date(remote.updated_at).toLocaleString()}.` : "Nothing saved to your account yet."}
      </p>
      <div className="dk-row" style={{ flexWrap: "wrap", marginTop: 8 }}>
        <button type="button" className="dk-btn" disabled={busy || !getDesk().profile.setupDone} onClick={() => void save()}>Save my plans to my account</button>
        <button type="button" className="dk-btn secondary" disabled={busy || !remote} onClick={load}>Load from my account</button>
      </div>
      <p style={{ fontSize: 13, marginTop: 8 }}>Only your answers, plans, scripts and style are stored, in a private row only you can read. Videos stay on your device.</p>
      {msg && <p role="status" style={{ fontSize: 14, marginTop: 6 }}>{msg}</p>}
    </div>
  );
}
