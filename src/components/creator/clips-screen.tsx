import { useEffect, useState } from "react";
import type { ScriptResult } from "@/lib/ai/contracts";
import { SAMPLE_SCRIPT, SCRIPT_SECTIONS } from "@/lib/creator-shared";
import { addSessionClips, getSessionClips, listGeneratedMedia, removeEditorCopy, removeSessionClip, sendGeneratedToEditor, type GeneratedMedia } from "@/lib/editor/session-store";
import { downloadMedia, SESSION_LINE } from "./section-media";
import type { ClipAsset } from "@/lib/editor/types";
import { usePersistentState } from "@/lib/use-persistent-state";

export function ClipsScreen({ go }: { go: (screen: "editor") => void }) {
  const [assets, setAssets] = useState<ClipAsset[]>([]);
  const [script, setScript] = usePersistentState<Record<string, string>>("script", {});
  const [options] = usePersistentState<ScriptResult["options"] | null>("script-options", null);
  const [choices, setChoices] = usePersistentState<Record<string, "a" | "b">>("clip-choices", {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState<GeneratedMedia[]>([]);
  const [mediaChoice, setMediaChoice] = usePersistentState<Record<string, "own" | "voice" | "video">>("media-choices", {});
  const [, setAiUsed] = usePersistentState<{ section: string; kind: "voice" | "video" }[]>("ai-content-used", []);
  useEffect(() => { setAssets(getSessionClips()); setGenerated(listGeneratedMedia()); }, []);
  const openEditor = async () => {
    setBusy(true); setError("");
    try {
      const used: { section: string; kind: "voice" | "video" }[] = [];
      for (const item of generated) {
        if ((mediaChoice[item.section] ?? "own") === item.kind) { await sendGeneratedToEditor(item); used.push({ section: item.section, kind: item.kind }); }
        else removeEditorCopy(item);
      }
      setAiUsed(used); setAssets(getSessionClips()); go("editor");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Generated media could not be added"); }
    finally { setBusy(false); }
  };
  const choose = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true); setError("");
    try { await addSessionClips(files); setAssets(getSessionClips()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The clips could not be read"); }
    finally { setBusy(false); }
  };
  return <div>
    <div style={{ marginBottom: 20 }}><h1>Your words are ready. Bring them to life.</h1><p className="sub">Record each section, choose Option A or B, then send the actual files to the editor. Files stay in this browser session.</p></div>
    <div className="g2"><div className="panel"><div className="row"><h2>Record or upload</h2><span className="sp" /><span className="tg n">Local clips only</span></div><div className="lab" style={{ marginTop: 14 }}>Shot list for this script</div><div className="stack">{SCRIPT_SECTIONS.filter(([key]) => key !== "tags").map(([key, label], index) => <div className="card" key={key}><div className="row"><span className="k" style={{ fontSize: 22 }}>{index + 1}</span><div style={{ flex: 1 }}><b>{label}</b><div style={{ fontSize: 13 }}>{script[key] ?? SAMPLE_SCRIPT[key]}</div></div></div>{<div style={{ marginTop: 8 }}>{(["a", "b"] as const).map((choice) => <button key={choice} className={"chip" + ((choices[key] ?? "a") === choice ? " on" : "")} aria-pressed={(choices[key] ?? "a") === choice} onClick={() => { setChoices({ ...choices, [key]: choice }); if (options) setScript({ ...script, [key]: options[key as "hook" | "problem" | "solution" | "cta"][choice] }); }}>Option {choice.toUpperCase()}</button>)}</div>}</div>)}</div>
      <div className="card" style={{ marginTop: 12, border: "2px dashed #9fb3d6", background: "transparent" }}><label className="btn g" style={{ display: "inline-block", cursor: "pointer" }}>{busy ? "Reading clips…" : "Choose clips from this device"}<input type="file" accept="video/*" multiple disabled={busy} style={{ position: "absolute", opacity: 0, width: 1, height: 1 }} onChange={(event) => void choose(Array.from(event.target.files ?? []))} /></label>{error && <div className="notice">{error}</div>}{assets.length === 0 ? <p className="note">No clips yet. Choose readable video files; nothing is uploaded.</p> : <div className="stack" style={{ marginTop: 10 }}>{assets.map((asset) => <div key={asset.sourceId} className="row"><video src={`${asset.url}#t=0.1`} muted playsInline preload="metadata" style={{ width: 54, height: 96, objectFit: "cover", borderRadius: 8 }} /><div style={{ flex: 1, minWidth: 0 }}><b>{asset.name}</b><div style={{ fontSize: 12.5 }}>{asset.duration.toFixed(1)} seconds · on this device only</div></div><button className="btn s g" onClick={() => { removeSessionClip(asset.sourceId); setAssets(getSessionClips()); }}>Remove</button></div>)}</div>}</div>
      <button className="btn" style={{ marginTop: 14 }} disabled={busy || (!assets.length && !generated.some((item) => mediaChoice[item.section] === item.kind))} onClick={() => void openEditor()}>Open clips in editor</button>
    </div>
    <div className="dark"><div className="row"><h2>AI voice and video</h2><span className="sp" /><span className="tg p">{generated.length ? `${generated.length} generated` : "None yet"}</span></div>
      {generated.length === 0 ? <p style={{ marginTop: 12, fontSize: 14 }}>Nothing generated in this session. Generate voice or video per section on the Script screen, or record everything yourself.</p> : <div className="stack" style={{ marginTop: 12 }}>{SCRIPT_SECTIONS.filter(([key]) => key !== "tags" && generated.some((item) => item.section === key)).map(([key, label]) => <div key={key} className="card"><b>{label}</b><div className="row" style={{ flexWrap: "wrap", marginTop: 6 }}>{(["own", "video", "voice"] as const).filter((kind) => kind === "own" || generated.some((item) => item.section === key && item.kind === kind)).map((kind) => <button key={kind} className={"chip" + ((mediaChoice[key] ?? "own") === kind ? " on" : "")} aria-pressed={(mediaChoice[key] ?? "own") === kind} onClick={() => setMediaChoice({ ...mediaChoice, [key]: kind })}>{kind === "own" ? "My recording" : kind === "video" ? "AI video" : "AI voice"}</button>)}</div>{generated.filter((item) => item.section === key).map((item) => <div key={item.key} className="row" style={{ marginTop: 8 }}><span className="tg r">{item.kind === "video" ? "AI video" : "AI voice"}</span>{item.kind === "video" ? <video src={item.url} controls playsInline style={{ width: 54, height: 96, objectFit: "cover", borderRadius: 8 }} /> : <audio src={item.url} controls style={{ flex: 1, minWidth: 0 }} />}<button className="btn s g" onClick={() => downloadMedia(item)}>Download</button></div>)}</div>)}</div>}
      <p className="note" style={{ color: "inherit" }}>The chosen item per section goes to the editor. {SESSION_LINE} No sample media is presented as generated.</p></div></div>
  </div>;
}
