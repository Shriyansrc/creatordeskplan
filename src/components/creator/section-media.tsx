import { useState } from "react";
import { useMediaJob, type JobView } from "@/lib/ai/media-client";
import { getGeneratedMedia, removeGeneratedMedia, setGeneratedMedia, type GeneratedMedia, type SectionKey } from "@/lib/editor/session-store";

export const BILLING_LINE = "Uses your provider account, billed by the provider. Each click starts one job.";
export const SESSION_LINE = "Generated media is kept in this browser tab only and is lost on refresh unless you download it.";

export function downloadMedia(item: GeneratedMedia) {
  const anchor = document.createElement("a"); anchor.href = item.url; anchor.download = item.name; anchor.click();
}

function JobLine({ view, onCancel, onRetry }: { view: JobView; onCancel: () => void; onRetry: () => void }) {
  if (view.phase === "idle" || view.phase === "done") return null;
  if (view.phase === "failed") return <div className="notice" role="alert">{view.message} <button className="btn s g" onClick={onRetry}>Retry</button></div>;
  const label = view.phase === "starting" ? "Starting job…" : view.phase === "downloading" ? "Downloading result…" : `${view.status === "queued" ? "Queued" : "Running"} · ${view.seconds}s`;
  return <div className="row" role="status" style={{ marginTop: 6 }}><span className="note" style={{ margin: 0 }}>{label}</span><span className="sp" /><button className="btn s g" onClick={onCancel}>Cancel</button></div>;
}

export function SectionMedia({ section, label, text, voiceOn, videoOn }: { section: SectionKey; label: string; text: string; voiceOn: boolean; videoOn: boolean }) {
  const [, bump] = useState(0);
  const refresh = () => bump((value) => value + 1);
  const voice = getGeneratedMedia("voice", section);
  const video = getGeneratedMedia("video", section);
  const [voiceMode, setVoiceMode] = useState<"provider" | "own">("provider");
  const [voiceName, setVoiceName] = useState("");
  const [speed, setSpeed] = useState(1);
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [prompt, setPrompt] = useState(`Vertical 9:16 shot illustrating: ${text}`.slice(0, 600));
  const [duration, setDuration] = useState(5);
  const [image, setImage] = useState<string | undefined>();
  const [imageError, setImageError] = useState("");
  const voiceJob = useMediaJob("voice", (blob) => { setGeneratedMedia("voice", section, blob); refresh(); });
  const videoJob = useMediaJob("video", (blob) => { setGeneratedMedia("video", section, blob); refresh(); });
  const startVoice = () => void voiceJob.run({ section, text, voice: voiceName.trim(), speed, language });
  const startVideo = () => void videoJob.run({ section, text, prompt, aspectRatio: "9:16", duration, referenceImage: image });
  const pickImage = (file: File | undefined) => {
    setImageError("");
    if (!file) { setImage(undefined); return; }
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 2_500_000) { setImageError("Use a PNG, JPEG or WebP under 2.5 MB."); return; }
    const reader = new FileReader(); reader.onload = () => setImage(String(reader.result)); reader.readAsDataURL(file);
  };

  return <details className="card" style={{ marginTop: 8 }}>
    <summary style={{ cursor: "pointer" }}><b>Option B for {label.toLowerCase()}: AI voice or video</b> <span className="note">Option A stays: I record it myself.</span></summary>
    <div className="g2 grid-r" style={{ marginTop: 10 }}>
      <div>
        <div className="lab">Generate voice</div>
        <div className="row" style={{ flexWrap: "wrap" }}>{(["provider", "own"] as const).map((mode) => <button key={mode} className={"chip" + (voiceMode === mode ? " on" : "")} aria-pressed={voiceMode === mode} onClick={() => setVoiceMode(mode)}>{mode === "own" ? "My own voice" : "Provider voice"}</button>)}</div>
        {voiceMode === "own" ? <p className="note">Record this section yourself on the Clips screen.</p> : <>
          <input className="field" style={{ marginTop: 8 }} aria-label="Voice name accepted by your provider" placeholder="Voice name from your provider" value={voiceName} onChange={(event) => setVoiceName(event.target.value)} />
          <div className="row" style={{ marginTop: 8 }}>
            <label style={{ fontSize: 13, flex: 1 }}>Speed {speed.toFixed(2)}x<input type="range" min={0.5} max={2} step={0.05} value={speed} onChange={(event) => setSpeed(Number(event.target.value))} style={{ width: "100%" }} /></label>
            <select className="field" aria-label="Voice language" value={language} onChange={(event) => setLanguage(event.target.value as "en" | "hi")} style={{ width: 120 }}><option value="en">English</option><option value="hi">Hindi</option></select>
          </div>
          {!voiceOn && <p className="note">Voice generation is not connected</p>}
          <button className="btn s" style={{ marginTop: 8 }} disabled={!voiceOn || voiceJob.busy || !voiceName.trim() || !text.trim()} onClick={startVoice}>{voice ? "Regenerate voice" : "Generate voice"}</button>
          <JobLine view={voiceJob.view} onCancel={() => void voiceJob.cancel()} onRetry={startVoice} />
        </>}
        {voice && <div style={{ marginTop: 8 }}><span className="tg r">AI voice</span><audio src={voice.url} controls style={{ width: "100%", marginTop: 6 }} aria-label={`AI voice for ${label}`} /><div className="row"><button className="btn s g" onClick={() => downloadMedia(voice)}>Download</button><button className="btn s g" onClick={() => { removeGeneratedMedia("voice", section); refresh(); }}>Remove</button></div></div>}
      </div>
      <div>
        <div className="lab">Generate video clip</div>
        <textarea className="field" rows={3} aria-label="Visual prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <label style={{ fontSize: 13, flex: 1 }}>Length {duration}s · 9:16<input type="range" min={3} max={10} step={1} value={duration} onChange={(event) => setDuration(Number(event.target.value))} style={{ width: "100%" }} /></label>
        </div>
        <label className="note" style={{ display: "block" }}>Optional reference image <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => pickImage(event.target.files?.[0])} /></label>
        {imageError && <div className="notice">{imageError}</div>}
        {!videoOn && <p className="note">Video generation is not connected</p>}
        <button className="btn s" style={{ marginTop: 8 }} disabled={!videoOn || videoJob.busy || prompt.trim().length < 3} onClick={startVideo}>{video ? "Regenerate video clip" : "Generate video clip"}</button>
        <JobLine view={videoJob.view} onCancel={() => void videoJob.cancel()} onRetry={startVideo} />
        {video && <div style={{ marginTop: 8 }}><span className="tg r">AI video</span><video src={video.url} controls playsInline style={{ width: 140, maxHeight: 250, borderRadius: 10, display: "block", marginTop: 6 }} aria-label={`AI video for ${label}`} /><div className="row"><button className="btn s g" onClick={() => downloadMedia(video)}>Download</button><button className="btn s g" onClick={() => { removeGeneratedMedia("video", section); refresh(); }}>Remove</button></div></div>}
      </div>
    </div>
    <p className="note">{BILLING_LINE} {SESSION_LINE}</p>
  </details>;
}
