import { useCallback, useEffect, useState } from "react";
import { ALL_PLATFORMS, PLATFORM_NAMES, type StudioShared, selectedPlatforms } from "@/lib/creator-shared";
import type { Platform } from "@/lib/ai/contracts";
import { getSessionExport } from "@/lib/editor/session-store";
import { usePersistentState } from "@/lib/use-persistent-state";
import { exportJobFile, getReelJobService, REEL_JOB_POLL_SECONDS, REEL_SOURCE_MAX_MB, reelStatusLabel, type ReelJob } from "@/lib/reel-jobs/service";

export function ReelJobButton({ st }: { st: StudioShared }) {
  const [open, setOpen] = useState(false);
  const [script] = usePersistentState<Record<string, string>>("script", {});
  const [source, setSource] = useState<"timeline" | "upload">("timeline");
  const [file, setFile] = useState<File | null>(null);
  const [topic, setTopic] = useState(st.topic);
  const [text, setText] = useState("");
  const [platform, setPlatform] = useState<Platform>(selectedPlatforms(st)[0] ?? "ig");
  const [length, setLength] = useState(30);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState<ReelJob | null>(null);
  useEffect(() => { if (open && !text) setText(["hook", "problem", "solution", "cta"].map((key) => script[key] ?? "").filter(Boolean).join("\n\n")); }, [open, script, text]);
  const exported = typeof window === "undefined" ? null : getSessionExport();
  const submit = async () => {
    setMessage(""); setSaved(null);
    const video = source === "timeline" ? exported?.blob ?? null : file;
    if (!video) { setMessage(source === "timeline" ? "Export the timeline first, or upload a file." : "Choose a video file."); return; }
    try {
      const service = getReelJobService();
      const job = await service.create({ topic, script: text, platform, lengthSeconds: length, notes, videoSource: source }, video);
      setSaved(job); setMessage(service.reason);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "The job could not be saved"); }
  };
  return <div style={{ marginTop: 14 }}>
    <div><button className="btn g" disabled aria-disabled="true">Generate a motion graphic reel for this video instead</button><p className="note">Reel generation is switched off until usage is authorized by the account owner. Nothing is charged.</p></div>
    {open && <div className="panel" style={{ marginTop: 10 }}>
      <p className="note">The reel service is not connected. Requests are saved on this device only and are not sent to anyone.</p>
      <div className="row" style={{ flexWrap: "wrap" }}>{(["timeline", "upload"] as const).map((item) => <button key={item} className={"chip" + (source === item ? " on" : "")} aria-pressed={source === item} onClick={() => setSource(item)}>{item === "timeline" ? "Current timeline export" : "Upload a file"}</button>)}</div>
      {source === "timeline" ? <p className="note">{exported ? `Uses ${exported.name}.` : "No export in this session yet."}</p> : <label className="note" style={{ display: "block" }}>Video file, up to {REEL_SOURCE_MAX_MB} MB <input type="file" accept="video/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>}
      <div className="stack" style={{ marginTop: 8 }}>
        <input className="field" aria-label="Reel topic" value={topic} onChange={(event) => setTopic(event.target.value)} />
        <textarea className="field" rows={5} aria-label="Script text" value={text} onChange={(event) => setText(event.target.value)} />
        <div className="row"><select className="field" aria-label="Platform" value={platform} onChange={(event) => setPlatform(event.target.value as Platform)}>{ALL_PLATFORMS.map((item) => <option key={item} value={item}>{PLATFORM_NAMES[item]}</option>)}</select><label style={{ fontSize: 13, flex: 1 }}>Length {length}s<input type="range" min={5} max={180} value={length} onChange={(event) => setLength(Number(event.target.value))} style={{ width: "100%" }} /></label></div>
        <textarea className="field" rows={2} aria-label="Notes, optional" placeholder="Notes, optional" value={notes} onChange={(event) => setNotes(event.target.value)} />
        <button className="btn" onClick={() => void submit()}>Save reel request</button>
      </div>
      {message && <div className="notice" role="status">{message}{saved && <> <button className="btn s g" onClick={() => exportJobFile(saved)}>Export job as file</button></>}</div>}
    </div>}
  </div>;
}

export function ReelJobsPanel() {
  const [jobs, setJobs] = useState<ReelJob[]>([]);
  const [service] = useState(() => (typeof window === "undefined" ? null : getReelJobService()));
  const refresh = useCallback(async () => { if (service) setJobs(await service.list()); }, [service]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REEL_JOB_POLL_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [refresh]);
  return <div style={{ marginBottom: 20 }}><div className="row"><div className="lab" style={{ margin: 0 }}>Reel jobs</div><span className="sp" /><span className="tg n">Reel service: Not connected</span></div>
    <p className="note">Saved on this device, not sent: the reel service is not connected. Statuses here are never shown as claimed, in progress or ready unless the real service reports it.</p>
    {jobs.length === 0 ? <p className="note">No reel requests yet.</p> : <div className="stack">{jobs.map((job) => <div key={job.id} className="card row"><div style={{ flex: 1, minWidth: 0 }}><b>{job.brief.topic}</b><div style={{ fontSize: 13 }}>{PLATFORM_NAMES[job.brief.platform]} · {job.brief.lengthSeconds}s · {new Date(job.createdAt).toLocaleString()}</div></div><span className="tg n">{reelStatusLabel(job)}</span><button className="btn s g" onClick={() => exportJobFile(job)}>Export job as file</button>{job.status !== "canceled" && <button className="btn s g" onClick={() => void service?.cancel(job.id).then(refresh)}>Cancel</button>}</div>)}</div>}
  </div>;
}
