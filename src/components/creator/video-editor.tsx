import { MotionControls } from "@/lib/editor/motion-controls";
import { SubjectControls } from "@/lib/editor/subject-controls";
import { useEffect, useRef, useState } from "react";
import { editInputSchema, editResponseSchema } from "@/lib/ai/contracts";
import type { EditOperation } from "@/lib/editor/contracts";
import { callAI, NOT_CONNECTED_COPY, useAIConnection } from "@/lib/ai/client";
import type { SetShared, StudioShared } from "@/lib/creator-shared";
import { selectedPlatforms } from "@/lib/creator-shared";
import { detectSilence, type SilenceRange } from "@/lib/editor/audio";
import { DIMENSIONS, drawFrame, exportProject, loadCaptionFont } from "@/lib/editor/export";
import { parseLocalPrompt } from "@/lib/editor/local-prompt";
import { applyOperations, clipDuration, clipFromAsset, clipStart, createProject, describeOperation, locateTime, projectDuration, wordTimelineTime } from "@/lib/editor/project";
import { addSessionClips, clearSessionExport, getSessionClips, saveSessionExport } from "@/lib/editor/session-store";
import { transcribeClip } from "@/lib/editor/transcribe";
import type { ClipAsset, EditorClip, EditorProject, PendingEdit, TranscriptWord } from "@/lib/editor/types";
import { StyleControls } from "@/lib/editor/style-controls";
import { prepareSoundtrack, type Soundtrack } from "@/lib/editor/soundtrack";
import { applyTalkingHeadStyle, NOT_AVAILABLE, type StyleResult } from "@/lib/editor/talking-head";
import "@/lib/editor/editor.css";
import { usePersistentState } from "@/lib/use-persistent-state";

const TOOLS = ["Media", "Trim", "Captions", "Crop", "Colour", "Style", "Engage", "Sound", "Motion", "Subject"] as const;
const RATIOS = ["9:16", "1:1", "4:5", "16:9"] as const;

function formatTime(value: number) {
  if (!Number.isFinite(value)) return "00:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function VideoEditor({ st, set, go }: { st: StudioShared; set: SetShared; go: (screen: "publish") => void }) {
  const [audioReady, setAudioReady] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const soundtrackRef = useRef<Soundtrack | null>(null);
  const seekAudioRef = useRef(false);
  const audioClipRef = useRef("");
  const styleRunning = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [styleResult, setStyleResult] = useState<Omit<StyleResult, "project"> | null>(null);
  const connection = useAIConnection();
  const [project, setProject, projectReady] = usePersistentState<EditorProject>("editor-project", createProject());
  const [transcript, setTranscript] = usePersistentState<TranscriptWord[]>("transcript", []);
  const [assets, setAssets] = useState<ClipAsset[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [dropOver, setDropOver] = useState(false);
  const [pending, setPending] = useState<PendingEdit | null>(null);
  const [prompt, setPrompt] = useState("");
  const [promptMode, setPromptMode] = useState<"basic" | "ai">("basic");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exportFormat, setExportFormat] = useState<"webm" | "mp4">("webm");
  const [exportProgress, setExportProgress] = useState(0);
  const [exportLabel, setExportLabel] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState("");
  const [exportName, setExportName] = useState("");
  const [overlayText, setOverlayText] = useState("");
  const [historyVersion, setHistoryVersion] = useState(0);
  const history = useRef<EditorProject[]>([]);
  const future = useRef<EditorProject[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const promptRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef(0);
  const dragRef = useRef<{ pointer: number; x: number; y: number; cropX: number; cropY: number } | null>(null);

  const view = pending?.preview ?? project;
  const location = locateTime(view, playhead);
  const activeClip = location?.clip;
  const selected = activeClip ?? view.clips.find((clip) => clip.id === selectedId) ?? view.clips[0];
  const totalDuration = projectDuration(view);
  const activeAsset = activeClip ? assets.find((asset) => asset.sourceId === activeClip.sourceId) : undefined;
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !video || !context || !activeClip || exporting) return;
    let stopped = false;
    let frame = 0;
    const render = () => {
      if (stopped) return;
      if (video.readyState >= 2) {
        const time = clipStart(view, activeClip.id) + Math.max(0, video.currentTime - activeClip.trimIn) / activeClip.speed;
        drawFrame(context, canvas, video, view, activeClip, transcript, time);
      }
      frame = requestAnimationFrame(render);
    };
    void loadCaptionFont().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Caption font unavailable"));
    render();
    return () => { stopped = true; cancelAnimationFrame(frame); };
  }, [view, activeClip, activeAsset?.url, transcript, exporting]);

  useEffect(() => {
    const available = getSessionClips();
    setAssets(available);
  }, []);

  useEffect(() => {
    if (!projectReady) return;
    const available = getSessionClips();
    setAssets(available);
    if (!project.clips.length && available.length) {
      setProject((current) => current.clips.length ? current : { ...current, clips: available.map(clipFromAsset) });
    }
  }, [projectReady, setProject]);

  useEffect(() => {
    if (selectedId && view.clips.some((clip) => clip.id === selectedId)) return;
    setSelectedId(view.clips[0]?.id ?? "");
  }, [selectedId, view.clips]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeClip || !location) return;
    video.playbackRate = activeClip.speed;
    video.volume = activeClip.volume;
    video.muted = audioReady || activeClip.muted;
    video.currentTime = Math.min(location.sourceTime, Math.max(0, video.duration || location.sourceTime));
    if (playing) void video.play().catch((cause: unknown) => { setPlaying(false); setError(cause instanceof Error ? cause.message : "Playback could not start"); });
    else video.pause();
  }, [activeClip?.id, activeAsset?.url, playing, audioReady]);

  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const video = videoRef.current;
      const currentLocation = locateTime(pending?.preview ?? project, playhead);
      if (!video || !currentLocation) return;
      const clip = currentLocation.clip;
      const nextTime = currentLocation.start + Math.max(0, video.currentTime - clip.trimIn) / clip.speed;
      setPlayhead(Math.min(nextTime, projectDuration(pending?.preview ?? project)));
      if (video.currentTime >= clip.trimOut - 0.02 || video.ended) {
        const nextStart = currentLocation.start + clipDuration(clip);
        if (nextStart >= projectDuration(pending?.preview ?? project) - 0.02) setPlaying(false);
        else setPlayhead(nextStart + 0.001);
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [playing, project, pending, playhead]);

  useEffect(() => {
    soundtrackRef.current = null;
    setAudioReady(false);
    audioSourceRef.current?.stop(); audioSourceRef.current = null;
  }, [project, pending, transcript, assets]);

  useEffect(() => {
    if (!playing || !audioReady || !soundtrackRef.current || !audioContextRef.current) {
      audioSourceRef.current?.stop(); audioSourceRef.current = null; audioClipRef.current = "";
      return;
    }
    if (audioClipRef.current === activeClip?.id && !seekAudioRef.current && audioSourceRef.current) return;
    audioSourceRef.current?.stop();
    const context = audioContextRef.current;
    const source = context.createBufferSource();
    source.buffer = soundtrackRef.current.mix;
    source.connect(context.destination);
    if (playhead < source.buffer.duration) source.start(0, playhead);
    audioSourceRef.current = source;
    audioClipRef.current = activeClip?.id ?? "";
    seekAudioRef.current = false;
  }, [playing, audioReady, activeClip?.id, playhead]);

  useEffect(() => () => { audioSourceRef.current?.stop(); void audioContextRef.current?.close(); }, []);

  const togglePlayback = async () => {
    if (playing) { setPlaying(false); return; }
    setBusy("Preparing local audio..."); setError("");
    try {
      let context = audioContextRef.current;
      if (!context) { context = new AudioContext(); audioContextRef.current = context; }
      await context.resume();
      if (!soundtrackRef.current) soundtrackRef.current = await prepareSoundtrack(context, view, assets, transcript);
      setAudioReady(true); setPlaying(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Audio preview unavailable."); }
    finally { setBusy(""); }
  };

  const snapshot = (value: EditorProject) => JSON.parse(JSON.stringify(value)) as EditorProject;
  const remember = () => {
    history.current.push(snapshot(project));
    future.current = [];
    setHistoryVersion((value) => value + 1);
  };
  const commit = (next: EditorProject) => {
    remember();
    setProject(next);
    setPending(null);
    setStyleResult(null);
    setError("");
  };
  const commitOperations = (operations: EditOperation[]) => commit(applyOperations(project, operations));
  const undo = () => {
    const previous = history.current.pop();
    if (!previous) return;
    future.current.push(snapshot(project));
    setStyleResult(null);
    setProject(previous); setPending(null); setPlaying(false); setHistoryVersion((value) => value + 1);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(snapshot(project));
    setStyleResult(null);
    setProject(next); setPending(null); setPlaying(false); setHistoryVersion((value) => value + 1);
  };
  void historyVersion;

  const seek = (time: number) => {
    const bounded = Math.max(0, Math.min(time, Math.max(0, totalDuration - 0.001)));
    seekAudioRef.current = true;
    setPlayhead(bounded);
    const found = locateTime(view, bounded);
    if (found && videoRef.current && found.clip.id === activeClip?.id) videoRef.current.currentTime = found.sourceTime;
  };

  const importFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy("Reading clips…"); setError("");
    try {
      const added = await addSessionClips(files);
      setAssets(getSessionClips());
      const live = new Set(getSessionClips().map((asset) => asset.sourceId));
      const used = new Set<string>();
      const relinked = project.clips.map((clip) => {
        if (live.has(clip.sourceId)) return clip;
        const match = added.find((asset) => asset.name === clip.name && !used.has(asset.sourceId));
        if (!match) return clip;
        used.add(match.sourceId);
        return { ...clip, sourceId: match.sourceId };
      });
      commit({ ...project, clips: [...relinked, ...added.filter((asset) => !used.has(asset.sourceId)).map(clipFromAsset)] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Clip import failed"); }
    finally { setBusy(""); }
  };

  const takeFiles = async (list: File[]) => {
    const ok = list.filter((f) => f.type.startsWith("video/") || /\.(mp4|mov|webm|m4v|mkv)$/i.test(f.name));
    const bad = list.length - ok.length;
    if (!ok.length) { setError(list.length ? "That is not a video file. Drop MP4, MOV or WebM clips." : ""); return; }
    await importFiles(ok);
    if (bad) setError(`${bad} file${bad === 1 ? " was" : "s were"} skipped because ${bad === 1 ? "it is" : "they are"} not video.`);
  };

  const hydrateSilence = async (operations: EditOperation[]) => {
    const hydrated: EditOperation[] = [];
    for (const operation of operations) {
      if (operation.type !== "removeSilence" || operation.ranges?.length) { hydrated.push(operation); continue; }
      setBusy("Analyzing audio for silence…");
      const ranges: SilenceRange[] = [];
      for (const clip of project.clips) {
        if (operation.clipId && operation.clipId !== clip.id) continue;
        const asset = assets.find((item) => item.sourceId === clip.sourceId);
        if (!asset) continue;
        ranges.push(...await detectSilence(clip, asset, operation.threshold, operation.minDuration));
      }
      if (!ranges.length) throw new Error("No silent sections met the detection threshold. Nothing was changed.");
      hydrated.push({ ...operation, ranges });
    }
    return hydrated;
  };

  const previewPrompt = async () => {
    if (!prompt.trim()) return;
    setBusy(promptMode === "ai" ? "Getting AI edit operations…" : "Parsing locally…"); setError(""); setPlaying(false);
    try {
      const compact = { ratio: project.ratio, clips: project.clips.map((clip) => ({ id: clip.id, sourceId: clip.sourceId, name: clip.name, trimIn: clip.trimIn, trimOut: clip.trimOut, speed: clip.speed, volume: clip.volume, muted: clip.muted })) };
      const input = editInputSchema.parse({ prompt, transcript: transcript.slice(0, 10000).map((word) => ({ clipId: project.clips.find((clip) => clip.originId === word.clipId)?.id ?? word.clipId, word: word.word, start: word.start, end: word.end })), timeline: compact });
      const response = promptMode === "ai" ? editResponseSchema.parse(await callAI<unknown, unknown>("edit", input)) : parseLocalPrompt(prompt, project);
      const operations = await hydrateSilence(response.operations);
      const preview = applyOperations(project, operations);
      setPending({ source: promptMode, prompt, summary: response.summary, operations, preview });
      setPlayhead(0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Edit preview failed"); }
    finally { setBusy(""); }
  };

  const runTranscription = async () => {
    setError("");
    const allWords: TranscriptWord[] = [];
    const knownOrigins = new Set(transcript.map((word) => word.clipId));
    const missing: string[] = [];
    try {
      for (const clip of project.clips) {
        if (knownOrigins.has(clip.originId)) continue;
        const asset = assets.find((item) => item.sourceId === clip.sourceId);
        if (!asset) { missing.push(clip.name); continue; }
        const words = await transcribeClip(clip, asset, setBusy);
        allWords.push(...words);
        knownOrigins.add(clip.originId);
        setTranscript([...transcript.filter((word) => word.clipId !== clip.originId), ...allWords]);
      }
      if (!project.clips.length) throw new Error("Add a clip before transcribing.");
      setBusy("");
      if (missing.length) setError(`${missing.join(", ")} needs to be chosen again before it can be transcribed. The other clips were transcribed.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Transcription failed"); setBusy(""); }
  };

  const previewSilence = async () => {
    setError("");
    try {
      const operations = await hydrateSilence([{ type: "removeSilence", threshold: 0.025, minDuration: 0.35, ranges: [] }]);
      setPending({ source: "basic", prompt: "Cut the silences", summary: "Detected silence is removed only after you accept.", operations, preview: applyOperations(project, operations) });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Silence detection failed"); }
    finally { setBusy(""); }
  };

  const runTalkingHeadStyle = async () => {
    if (styleRunning.current || busy || exporting || !project.clips.length) return;
    styleRunning.current = true;
    setPlaying(false); setBusy("Applying talking-head style locally..."); setError("");
    try {
      await loadCaptionFont();
      const detected: SilenceRange[] = [];
      const failures: string[] = [];
      for (const clip of project.clips) {
        const asset = assets.find((item) => item.sourceId === clip.sourceId);
        if (!asset) { failures.push(`Silence detection skipped for ${clip.name}: choose the original file again.`); continue; }
        try { detected.push(...await detectSilence(clip, asset, 0.01, 0.35)); }
        catch { failures.push(`Silence detection unavailable for ${clip.name}. No audio cuts made in that clip.`); }
      }
      const result = applyTalkingHeadStyle(project, transcript, detected, failures);
      commit(result.project);
      setStyleResult({ changed: result.changed, couldNot: result.couldNot });
      setPlayhead(0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Style could not be applied."); }
    finally { styleRunning.current = false; setBusy(""); }
  };

  const doExport = async () => {
    setError(""); clearSessionExport(); window.localStorage.removeItem("cd:export"); if (exportUrl) URL.revokeObjectURL(exportUrl); setExportUrl(""); setExportName(""); setExporting(true); setExportProgress(0); setExportLabel("Preparing export…"); setPlaying(false);
    try {
      const blob = await exportProject(project, assets, transcript, exportFormat, (value, label) => { setExportProgress(value); setExportLabel(label); });
      const name = `creator-desk-${Date.now()}.${exportFormat}`;
      const saved = saveSessionExport(blob, name);
      setExportUrl(saved.url); setExportName(name);
      window.localStorage.setItem("cd:export", JSON.stringify({ name, type: blob.type, size: blob.size, createdAt: new Date().toISOString(), platforms: selectedPlatforms(st) }));
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : JSON.stringify(cause);
      setError(detail || "Export failed without an error message"); setExportLabel("Export failed");
    }
    finally { setExporting(false); }
  };

  const updateColor = (key: keyof EditorClip["color"], value: number) => {
    if (!selected) return;
    commitOperations([{ type: "color", clipId: selected.id, [key]: value }]);
  };

  return <div className="talking-head-editor workspace-editor">
    <header className="editor-header"><div><h1>Edit your video</h1><p className="sub">Your footage. Reversible edits.</p></div><div className="row"><button className="btn s g" onClick={undo} disabled={!history.current.length}>Undo</button><button className="btn s g" onClick={redo} disabled={!future.current.length}>Redo</button><button className="btn s" onClick={doExport} disabled={exporting || Boolean(busy) || !project.clips.length}>Save video</button></div></header>
    {busy && <p className="editor-message" role="status">{busy}</p>}
    {error && <div className="notice editor-message" role="alert">{error}</div>}
    <div className="ed editor-workspace">
      <nav className="tools editor-toolbar" aria-label="Editing tools"><label className="editor-tool-select">Tool<select aria-label="Choose editing tool" value={st.tool} onChange={event => set({ tool: event.target.value })}>{TOOLS.map(tool => <option key={tool} value={tool}>{tool}</option>)}</select></label>{TOOLS.map((tool) => <button key={tool} className={st.tool === tool ? "on" : ""} onClick={() => set({ tool })}>{tool}</button>)}</nav>
      <section className="editor-viewer" aria-label="Video and timeline">
        <div className="estage">
          <div className="phone editor-phone" style={{ aspectRatio: view.ratio.replace(":", "/") }} onPointerDown={(event) => {
            if (!selected || st.tool !== "Crop") return;
            remember();
            dragRef.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, cropX: selected.crop.x, cropY: selected.crop.y };
            event.currentTarget.setPointerCapture(event.pointerId);
          }} onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointer !== event.pointerId || !selected) return;
            const x = Math.max(-50, Math.min(50, drag.cropX + (event.clientX - drag.x) / 4));
            const y = Math.max(-50, Math.min(50, drag.cropY + (event.clientY - drag.y) / 4));
            setProject((current) => applyOperations(current, [{ type: "crop", clipId: selected.id, ratio: current.ratio, x, y }]));
          }} onPointerUp={() => { dragRef.current = null; }}>
            {activeClip && activeAsset ? <><video className="editor-source" key={activeClip.id} ref={videoRef} src={activeAsset.url} playsInline preload="auto" onClick={togglePlayback} /><canvas className="editor-render" ref={canvasRef} width={DIMENSIONS[view.ratio][0]} height={DIMENSIONS[view.ratio][1]} aria-label="Edited video preview" /></> : <div className="editor-empty"><b>No video yet</b><p>Choose a video to edit.</p></div>}
            {activeClip && activeAsset && <button className="editor-play" aria-label={playing ? "Pause preview" : "Play preview with audio"} onPointerDown={event => event.stopPropagation()} onClick={togglePlayback} disabled={Boolean(busy) || exporting}>{playing ? "Pause" : "Play"}</button>}
            {st.tool === "Crop" && selected && <span className="crop-handle" aria-label="Drag to reframe" />}
          </div>
          <div className="eratio">{RATIOS.map((ratio) => <button key={ratio} className={"chip" + (view.ratio === ratio ? " on" : "")} onClick={() => commitOperations([{ type: "crop", ratio }])}>{ratio}</button>)}<span className="sp" /><span style={{ fontSize: 12 }}>{formatTime(playhead)} / {formatTime(totalDuration)}</span></div>
        </div>
        <div className="tl editor-timeline">
          <div className="timeline-ruler" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); seek(((event.clientX - rect.left) / rect.width) * totalDuration); }}><span style={{ left: `${totalDuration ? playhead / totalDuration * 100 : 0}%` }} /></div>
          <div className="strip editor-strip">{view.clips.map((clip, index) => { const asset = assets.find((item) => item.sourceId === clip.sourceId); const original = project.clips.find((item) => item.id === clip.id); return <button key={clip.id} className={"timeline-clip" + (selected?.id === clip.id ? " selected" : "") + (pending && !original ? " changed" : "")} style={{ flexGrow: Math.max(1, clipDuration(clip)) }} onClick={() => { setSelectedId(clip.id); seek(clipStart(view, clip.id)); }}><span>{index + 1}. {clip.name}</span>{asset ? <video src={`${asset.url}#t=${clip.trimIn}`} muted preload="metadata" aria-hidden="true" /> : <i>File needed</i>}<small>{clip.trimIn.toFixed(1)}–{clip.trimOut.toFixed(1)}s · {clip.speed}x</small></button>; })}</div>
          <div className="capbar">Caption track: {view.captionsEnabled ? `${transcript.length} transcribed words` : "off"}</div>
          <div className="audio-track">Audio track · {view.clips.filter((clip) => clip.muted).length} muted clips</div>
          {pending && <div className="pending-track">Proposed edit preview, not applied yet</div>}
        </div>
      </section>
      <aside className="editor-inspector" aria-label="Active editing controls" tabIndex={0}>
        <p className="editor-target">{selected ? `Editing: ${selected.name}` : "Add your footage to start"}</p>
        <div className="panel"><div className="lab">{st.tool}</div>
          {st.tool === "Media" && <div><label className="btn g s">Import clips<input type="file" accept="video/*" multiple hidden onChange={(event) => void importFiles(Array.from(event.target.files ?? []))} /></label><p className="note">{project.clips.length} clips on the timeline. Session files stay on this device.</p></div>}
          {st.tool === "Trim" && selected && <div className="stack"><div className="row"><button className="btn s g" onClick={() => activeClip && location && commitOperations([{ type: "split", clipId: activeClip.id, at: location.sourceTime }])}>Split at playhead</button><button className="btn s g" onClick={() => commitOperations([{ type: "delete", clipId: selected.id }])}>Delete clip</button></div><div className="row"><button className="btn s g" disabled={view.clips.indexOf(selected) <= 0} onClick={() => commitOperations([{ type: "reorder", clipId: selected.id, toIndex: view.clips.indexOf(selected) - 1 }])}>Move earlier</button><button className="btn s g" disabled={view.clips.indexOf(selected) >= view.clips.length - 1} onClick={() => commitOperations([{ type: "reorder", clipId: selected.id, toIndex: view.clips.indexOf(selected) + 1 }])}>Move later</button></div><label className="lab">Trim in, seconds<input key={`${selected.id}-in-${selected.trimIn}`} className="field" type="number" min={0} max={selected.trimOut - 0.05} step={0.1} defaultValue={selected.trimIn} onBlur={(event) => commitOperations([{ type: "trim", clipId: selected.id, start: Number(event.target.value), end: selected.trimOut }])} /></label><label className="lab">Trim out, seconds<input key={`${selected.id}-out-${selected.trimOut}`} className="field" type="number" min={selected.trimIn + 0.05} max={selected.sourceDuration} step={0.1} defaultValue={selected.trimOut} onBlur={(event) => commitOperations([{ type: "trim", clipId: selected.id, start: selected.trimIn, end: Number(event.target.value) }])} /></label><label className="lab">Speed: {selected.speed.toFixed(2)}x<input type="range" min={0.25} max={4} step={0.05} value={selected.speed} onChange={(event) => commitOperations([{ type: "speed", clipId: selected.id, value: Number(event.target.value) }])} /></label><button className="btn s g" onClick={previewSilence}>Preview silence removal</button></div>}
          {st.tool === "Captions" && <div><label className="row"><input type="checkbox" checked={view.captionsEnabled} onChange={(event) => commitOperations([{ type: "captions", enabled: event.target.checked }])} /> Burn-in captions</label><div className="lab" style={{ marginTop: 12 }}>Style</div>{(["owner", "plain"] as const).map((preset) => <button key={preset} className={"chip" + (view.captionStyle.preset === preset ? " on" : "")} onClick={() => { remember(); setProject((current) => ({ ...current, captionStyle: { ...current.captionStyle, preset } })); }}>{preset === "owner" ? "Font" : "Plain"}</button>)}<label className="lab">Size {view.captionStyle.size}px<input type="range" min={32} max={92} value={view.captionStyle.size} onChange={(event) => { remember(); setProject((current) => ({ ...current, captionStyle: { ...current.captionStyle, size: Number(event.target.value) } })); }} /></label><label className="lab">Vertical position {view.captionStyle.position}%<input type="range" min={20} max={80} value={view.captionStyle.position} onChange={(event) => { remember(); setProject((current) => ({ ...current, captionStyle: { ...current.captionStyle, position: Number(event.target.value) } })); }} /></label><label className="lab">Caption colour<input className="field" type="color" value={view.captionStyle.color} onChange={(event) => { remember(); setProject((current) => ({ ...current, captionStyle: { ...current.captionStyle, color: event.target.value } })); }} /></label><p className="note">Font: sentence capitals and I, no punctuation, chest-line words, lemon keyword, hard cuts, seven-frame phrase breaks.</p></div>}
          {st.tool === "Crop" && selected && <div><p style={{ fontSize: 14 }}>Drag the frame to reframe. Choose a ratio below the preview.</p><label className="lab">Zoom {selected.crop.zoom.toFixed(2)}x<input type="range" min={1} max={4} step={0.05} value={selected.crop.zoom} onChange={(event) => commitOperations([{ type: "crop", clipId: selected.id, ratio: view.ratio, zoom: Number(event.target.value) }])} /></label><p className="note">Offset X {selected.crop.x.toFixed(0)}, Y {selected.crop.y.toFixed(0)}</p></div>}
          {st.tool === "Colour" && selected && <div>{([["brightness", "Brightness", 0, 200], ["contrast", "Contrast", 0, 200], ["saturation", "Saturation", 0, 200], ["temperature", "Temperature", -100, 100]] as const).map(([key, label, min, max]) => <label className="lab" key={key}>{label}: {selected.color[key]}<input aria-label={label} type="range" min={min} max={max} value={selected.color[key]} onChange={(event) => updateColor(key, Number(event.target.value))} /></label>)}</div>}
          {st.tool === "Style" && selected && <div><p style={{ fontSize: 14 }}>Pick a look for this clip. It sets colour in one tap and you can undo it.</p><div className="row" style={{ flexWrap: "wrap" }}>{([["Clean", 100, 105, 100, 0], ["Warm", 105, 105, 110, 30], ["Punchy", 105, 125, 130, 0], ["Soft", 110, 90, 90, 10], ["Cool", 100, 105, 100, -30]] as const).map(([label, brightness, contrast, saturation, temperature]) => <button key={label} className="chip" onClick={() => commitOperations([{ type: "color", clipId: selected.id, brightness, contrast, saturation, temperature }])}>{label}</button>)}</div><p className="note">Caption look is set in Captions.</p></div>}
          {st.tool === "Engage" && selected && <div><label className="lab">Text overlay<input className="field" value={overlayText} onChange={(event) => setOverlayText(event.target.value)} placeholder="Text on screen" /></label><button className="btn s g" disabled={!overlayText.trim()} onClick={() => { commitOperations([{ type: "textOverlay", text: overlayText.trim(), start: playhead, end: Math.min(totalDuration, playhead + 3) }]); setOverlayText(""); }}>Add for 3 seconds</button><button className="btn s g" style={{ marginTop: 10 }} onClick={() => activeClip && location && commitOperations([{ type: "zoom", clipId: activeClip.id, start: location.sourceTime, end: Math.min(activeClip.trimOut, location.sourceTime + 1), scale: 1.2 }])}>Add zoom punch-in at playhead</button>{view.overlays.length > 0 && <div className="stack" style={{ marginTop: 12 }}>{view.overlays.map((item) => <div className="card row" key={item.id}><span style={{ flex: 1 }}>{item.text}</span><button className="btn s g" onClick={() => { remember(); setProject((current) => ({ ...current, overlays: current.overlays.filter((overlayItem) => overlayItem.id !== item.id) })); }}>Remove</button></div>)}</div>}</div>}
          {st.tool === "Sound" && selected && <div><label className="lab">Volume {Math.round(selected.volume * 100)}%<input type="range" min={0} max={1} step={0.05} value={selected.volume} onChange={(event) => commitOperations([{ type: "volume", clipId: selected.id, value: Number(event.target.value), muted: false }])} /></label><button className="btn s g" onClick={() => commitOperations([{ type: "volume", clipId: selected.id, value: selected.volume, muted: !selected.muted }])}>{selected.muted ? "Unmute clip" : "Mute clip"}</button></div>}
          {!selected && st.tool !== "Media" && <p className="note">Add a clip to use these controls.</p>}
        </div>
        {st.tool === "Media" && <label className={"dropzone" + (dropOver ? " over" : "")} onDragOver={(event) => { event.preventDefault(); setDropOver(true); }} onDragLeave={() => setDropOver(false)} onDrop={(event) => { event.preventDefault(); setDropOver(false); void takeFiles(Array.from(event.dataTransfer.files)); }} style={{ display: "block", marginTop: 12, padding: "22px 16px", border: "2px dashed #9fb3d6", borderRadius: 16, textAlign: "center", cursor: "pointer", background: dropOver ? "#eaf1ff" : "transparent" }}>
      <b style={{ display: "block", fontSize: 18 }}>Drop your clips here</b>
      <span style={{ fontSize: 14 }}>or tap to choose videos from your device. They open on the timeline below and stay on this device.</span>
      <input type="file" accept="video/*" multiple hidden onChange={(event) => { void takeFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
    </label>}
        {st.tool === "Captions" && <div className="panel"><div className="row"><div className="lab" style={{ margin: 0 }}>Transcript</div><span className="sp" /><button className="btn s g" onClick={runTranscription} disabled={!project.clips.length || Boolean(busy)}>Transcribe locally</button></div><p className="note">Basic, runs in your browser. Whisper runs locally; the first use downloads the model.</p><p className="trs">{transcript.length ? transcript.map((word) => <button key={word.id} className="tw" onClick={() => { const time = wordTimelineTime(project, word); if (time !== null) seek(time); }}>{word.word}</button>) : "No transcript yet. Transcribe your own clip to create clickable words and timed captions."}</p></div>}
        {st.tool === "Motion" && <MotionControls project={view} transcript={transcript} change={commit} />}
        {st.tool === "Subject" && <SubjectControls project={view} assets={assets} change={commit} />}
        {st.tool === "Sound" && <StyleControls project={view} transcript={transcript} change={commit} />}
        {st.tool === "Style" && <><button className="btn s g" onClick={runTalkingHeadStyle} disabled={Boolean(busy) || exporting || !project.clips.length}>Apply my talking-head style</button>    {styleResult && <section className="style-result" aria-label="Talking-head style result"><h2>Changed</h2><ul>{styleResult.changed.map((item) => <li key={item}>{item}</li>)}</ul>{styleResult.couldNot.length > 0 && <><h2>Could not apply</h2><ul>{styleResult.couldNot.map((item) => <li key={item}>{item}</li>)}</ul></>}<h2>Available, not applied</h2><ul>{!project.motionScenes?.length && <li>Continuous transcript-led motion scenes</li>}{!project.wrappingCaptions?.enabled && <li>Optional manually positioned wrapping captions</li>}{(!project.subjectMode || project.subjectMode === "original") && <li>Experimental local subject sticker/silhouette after mask preparation</li>}{!project.music?.enabled && <li>Background music: local file or synthesised soft pad</li>}</ul><h2>Not available yet</h2><ul>{NOT_AVAILABLE.map((item) => <li key={item}>{item}</li>)}</ul></section>}
</>}
        <details className="editor-prompt"><summary>Edit by prompt</summary>
    <div className="panel" style={{ marginTop: 12 }}><div className="row" style={{ flexWrap: "wrap" }}><div className="nav"><button className={promptMode === "basic" ? "on" : ""} onClick={() => setPromptMode("basic")}>Basic local mode</button><button className={promptMode === "ai" ? "on" : ""} onClick={() => setPromptMode("ai")} disabled={connection.state !== "connected"}>AI mode</button></div><span className="tg n">{promptMode === "basic" ? "Basic, runs in your browser" : connection.state === "connected" ? "Connected" : "Not connected"}</span></div><div className="row" style={{ marginTop: 10 }}><input ref={promptRef} className="field" aria-label="Edit by prompt" placeholder="Tell the editor what to change, in your words..." value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void previewPrompt(); }} /><button className="btn" disabled={Boolean(busy) || !prompt.trim() || (promptMode === "ai" && connection.state !== "connected")} onClick={previewPrompt}>Apply edit</button></div>{promptMode === "ai" && connection.state !== "connected" && <p className="note">{NOT_CONNECTED_COPY}</p>}<p className="note">Every edit shows its change list first. Apply or undo. Nothing silently changes.</p></div>
    {pending && <div className="panel pending-edit" style={{ marginTop: 12 }}><div className="row"><h2>Review the proposed edit</h2><span className="sp" /><span className={"tg " + (pending.source === "ai" ? "r" : "n")}>{pending.source === "ai" ? "Connected AI operations" : "Basic local operations"}</span></div><p>{pending.summary}</p><div className="stack" style={{ margin: "12px 0" }}>{pending.operations.map((operation, index) => <div className="card" key={`${operation.type}-${index}`}>{describeOperation(operation)}</div>)}</div><div className="row" style={{ flexWrap: "wrap" }}><button className="btn" onClick={() => commit(pending.preview)}>Accept edit</button><button className="btn g" onClick={() => setPending(null)}>Reject</button><button className="btn g" onClick={() => { setPrompt(pending.prompt); setPending(null); promptRef.current?.focus(); }}>Tweak prompt</button></div></div>}
        </details>
      </aside>
    </div>
    <footer className="editor-export">
    <div className="panel" style={{ marginTop: 12 }}><div className="row" style={{ flexWrap: "wrap" }}><div><div className="lab">Real on-device export</div><select className="field" aria-label="Export format" value={exportFormat} onChange={(event) => { if (exportUrl) URL.revokeObjectURL(exportUrl); setExportUrl(""); setExportName(""); setExportLabel(""); setExportProgress(0); setExportFormat(event.target.value as "webm" | "mp4"); }}><option value="webm">WebM</option><option value="mp4">MP4 (local FFmpeg conversion)</option></select></div><span className="sp" /><button className="btn" disabled={exporting || !project.clips.length} onClick={doExport}>Export video</button>{exportUrl && <a className="btn g" href={exportUrl} download={exportName}>Download {exportName.split(".").pop()?.toUpperCase()}</a>}{exportUrl && <button className="btn g" onClick={() => go("publish")}>Continue to publish</button>}</div>{exportLabel && <><div className="bar" style={{ marginTop: 12 }}><i style={{ width: `${Math.round(exportProgress * 100)}%` }} /></div><p className="note">{exportLabel} · {Math.round(exportProgress * 100)}%</p></>}<p className="note">Export renders every frame at 30 fps, then packs audio on this device. It may take longer than the video. Keep this tab open. Both formats load the local FFmpeg core on first use. Your original is never modified.</p></div>
    </footer>
  </div>;
    }
