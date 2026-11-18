import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { patchDesk, useDesk } from "@/desk/store";
import { addSessionClips } from "@/lib/editor/session-store";

export const Route = createFileRoute("/desk/create")({ component: Create });

function Create() {
  const d = useDesk();
  const nav = useNavigate();
  const plan = d.plan?.data;
  const [id, setId] = useState(Object.keys(d.scripts)[0] ?? "");
  const topic = plan?.topics.find((t) => t.id === id);
  const sc = d.scripts[id]?.data;
  const vid = useRef<HTMLVideoElement>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"idle" | "ready" | "recording">("idle");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [size, setSize] = useState(30);
  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);
  void patchDesk;

  const openCam = async () => {
    setErr("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
      stream.current = s;
      if (vid.current) { vid.current.srcObject = s; await vid.current.play(); }
      setState("ready");
    } catch {
      setErr("Camera or microphone is blocked. Allow access in your browser, or upload a clip instead.");
    }
  };
  const start = () => {
    if (!stream.current) return;
    chunks.current = [];
    const r = new MediaRecorder(stream.current);
    r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    r.onstop = async () => {
      const type = r.mimeType || "video/webm";
      const file = new File(chunks.current, `recording-${Date.now()}.${type.includes("mp4") ? "mp4" : "webm"}`, { type });
      try { await addSessionClips([file]); setMsg("Recording added to the editor."); } catch (e) { setErr(e instanceof Error ? e.message : "Could not read the recording."); }
    };
    r.start();
    rec.current = r;
    setState("recording");
  };
  const stop = () => { rec.current?.stop(); setState("ready"); };
  const upload = async (files: File[]) => {
    setErr("");
    try { await addSessionClips(files); setMsg(`${files.length} clip${files.length > 1 ? "s" : ""} added to the editor.`); } catch (e) { setErr(e instanceof Error ? e.message : "Could not read that file."); }
  };

  return (
    <>
      <h1>Create</h1>
      <p style={{ fontSize: 20, margin: "10px 0 20px" }}>Record yourself reading your script, or bring a clip you already shot.</p>
      {err && <div className="dk-err" role="alert">{err}</div>}
      {msg && <div className="dk-note" role="status" style={{ marginBottom: 14 }}>{msg} <button type="button" className="dk-link" onClick={() => void nav({ to: "/desk/editor" })}>Open editor</button></div>}
      <div className="dk-g2" style={{ gap: 22, alignItems: "start" }}>
        <div className="dk-panel">
          <div className="dk-label">Script</div>
          {Object.keys(d.scripts).length === 0 ? (
            <p>No script yet. <Link to="/desk/plan" style={{ color: "var(--blue)" }}>Write one in your plan</Link>.</p>
          ) : (
            <>
              <select className="dk-field" value={id} onChange={(e) => setId(e.target.value)} aria-label="Choose a script" style={{ marginBottom: 12 }}>
                {Object.keys(d.scripts).map((k) => <option key={k} value={k}>{(plan?.topics.find((t) => t.id === k.replace(/@ref$/, ""))?.title ?? k.replace(/@ref$/, "")) + (k.endsWith("@ref") ? " (from reference)" : "")}</option>)}
              </select>
              {sc && (
                <>
                  <label className="dk-label">Reading size {size}px<input type="range" min={20} max={56} value={size} onChange={(e) => setSize(Number(e.target.value))} style={{ width: "100%" }} /></label>
                  <div style={{ fontSize: size, lineHeight: 1.3, maxHeight: 420, overflow: "auto" }}>
                    {[sc.hook, sc.problem, sc.solution, sc.cta].map((t, i) => <p key={i} style={{ margin: "0 0 14px" }}>{t}</p>)}
                  </div>
                </>
              )}
              {topic && <p style={{ fontSize: 14, marginTop: 8 }}>{topic.title}</p>}
            </>
          )}
        </div>
        <div className="dk-panel">
          <div className="dk-label">Record</div>
          <video ref={vid} muted playsInline style={{ width: "100%", borderRadius: 14, background: "#dfe6f0", aspectRatio: "9/16", maxHeight: 420, objectFit: "cover", display: state === "idle" ? "none" : "block" }} />
          <div className="dk-row" style={{ marginTop: 12 }}>
            {state === "idle" && <button type="button" className="dk-btn" onClick={() => void openCam()}>Turn on camera</button>}
            {state === "ready" && <button type="button" className="dk-btn" onClick={start}>Start recording</button>}
            {state === "recording" && <button type="button" className="dk-btn" onClick={stop}>Stop recording</button>}
            <label className="dk-btn secondary" style={{ cursor: "pointer" }}>Upload clips<input type="file" accept="video/*" multiple hidden onChange={(e) => void upload(Array.from(e.target.files ?? []))} /></label>
          </div>
          <p style={{ fontSize: 14, marginTop: 10 }}>Clips stay on this device for this session. Nothing is uploaded to a server.</p>
        </div>
      </div>
    </>
  );
}
