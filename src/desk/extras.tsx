import { useEffect, useState } from "react";
import { getDesk } from "@/desk/store";
import { applyRemote, fetchRemote, lastSyncedAt, pushLocal, type Remote } from "@/desk/sync";
import { Spinner } from "@/desk/ui";
import { analyseReference, errorText, learnStyle } from "@/desk/api";
import { usePersistentState } from "@/lib/use-persistent-state";
import type { ReferenceResult, StyleResult } from "@/lib/ai/contracts";

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

export function ReferenceAnalysis({ topic, niche }: { topic: string; niche: string }) {
  const [platform, setPlatform] = useState<"yt" | "ig" | "x">("ig");
  const [link, setLink] = useState("");
  const [views, setViews] = useState("");
  const [likes, setLikes] = useState("");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = usePersistentState<{ key: string; data: ReferenceResult } | null>("ref-analysis", null);
  const key = `${platform}|${link}|${pasted.slice(0, 40)}`;
  const run = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const data = await analyseReference({ platform, link, views, likes, pasted, topic, niche });
      setRes({ key, data });
    } catch (e) {
      setErr(errorText(e));
    }
    setBusy(false);
  };
  const [fetching, setFetching] = useState(false);
  const [note, setNote] = useState("");
  const fetchLink = async () => {
    if (fetching) return;
    setFetching(true);
    setNote("");
    try {
      const r = await fetch("/api/link-meta", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ link }) });
      const d = (await r.json()) as { ok: boolean; reason?: string; title?: string; author?: string; text?: string };
      if (!d.ok) setNote(d.reason ?? "Could not read that link.");
      else {
        const parts = [d.title && `Title: ${d.title}`, d.author && `By: ${d.author}`, d.text && `Post text: ${d.text}`].filter(Boolean).join("\n");
        setPasted((cur) => (cur.trim() ? `${cur}\n${parts}` : parts));
        setNote("Read the public details from the link. Add the caption or transcript for a deeper breakdown.");
      }
    } catch {
      setNote("Could not read that link. Paste the text instead.");
    }
    setFetching(false);
  };
  const r = res?.data;
  return (
    <div className="dk-list" style={{ marginTop: 8 }}>
      <span className="dk-tag est">AI ANALYSES TEXT</span>
      <p>YouTube and X links: the app reads the public title, channel and post text. Instagram does not allow that, so paste its caption. The AI never watches the video itself, so add the caption or transcript for a deeper breakdown.</p>
      <div className="dk-row" style={{ flexWrap: "wrap" }}>{(["ig", "yt", "x"] as const).map((x) => <button key={x} type="button" className={"dk-chip" + (platform === x ? " on" : "")} onClick={() => setPlatform(x)}>{x === "ig" ? "Instagram" : x === "yt" ? "YouTube" : "X"}</button>)}</div>
      <label className="dk-item"><div className="dk-label">Link (optional)</div><input className="dk-field" value={link} onChange={(e) => setLink(e.target.value)} /></label>
      {platform !== "ig" && <button type="button" className="dk-btn secondary" disabled={fetching || !link.trim()} onClick={() => void fetchLink()}>{fetching ? <Spinner /> : null}Read details from the link</button>}
      {note && <p role="status" style={{ fontSize: 14 }}>{note}</p>}
      <div className="dk-row"><input className="dk-field" aria-label="Views" placeholder="Views" value={views} onChange={(e) => setViews(e.target.value)} /><input className="dk-field" aria-label="Likes" placeholder="Likes" value={likes} onChange={(e) => setLikes(e.target.value)} /></div>
      <label className="dk-item"><div className="dk-label">Caption or transcript</div><textarea className="dk-field" rows={5} value={pasted} onChange={(e) => setPasted(e.target.value)} /></label>
      <button type="button" className="dk-btn" disabled={busy || pasted.trim().length < 20} onClick={() => void run()}>{busy ? <Spinner /> : null}Analyse this reference</button>
      {err && <p className="dk-err" role="alert">{err}</p>}
      {r && (
        <div className="dk-item">
          <div className="dk-label">What it is</div><p>{r.summary}</p>
          <div className="dk-label">Hook pattern</div><p>{r.hookPattern}</p>
          <div className="dk-label">Structure</div><ol>{r.structure.map((b) => <li key={b.beat}><b>{b.beat}</b>: {b.detail}</li>)}</ol>
          <div className="dk-label">Why it works</div><ul>{r.whyItWorks.map((x) => <li key={x}>{x}</li>)}</ul>
          <div className="dk-label">Adapt for you</div><ul>{r.adaptForMe.map((x) => <li key={x}>{x}</li>)}</ul>
          {r.avoid.length > 0 && <><div className="dk-label">Avoid copying</div><ul>{r.avoid.map((x) => <li key={x}>{x}</li>)}</ul></>}
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
      const res = await fetch("/api/ai/speech", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 1600), style: "clearly and naturally, like a friendly teacher", ...(getDesk().profile.language ? { language: getDesk().profile.language } : {}) }) });
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
