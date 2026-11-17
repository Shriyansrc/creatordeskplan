import { makeLocalId } from "./session-store";
import { projectDuration } from "./project";
import { needsSubjectMasks, subjectBeatError } from "./subject-beats";
import { useEffect, useRef, useState } from "react";
import { prepareSubjectMasks, subjectMasksReady } from "./subject-mask";
import type { ClipAsset, EditorProject } from "./types";
export function SubjectControls({
  project,
  assets,
  change,
}: {
  project: EditorProject;
  assets: ClipAsset[];
  change: (project: EditorProject) => void;
}) {
  const [beatStart, setBeatStart] = useState("0");
  const [beatEnd, setBeatEnd] = useState("1");
  const [beatMode, setBeatMode] = useState<"sticker" | "silhouette">("sticker");
  const [beatMessage, setBeatMessage] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [, refresh] = useState(0);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const ready = project.clips.length > 0 && subjectMasksReady(project);
  return (
    <section className="panel" aria-label="Local subject masks">
      <h2>Subject cutout (experimental)</h2>
      <p>
        Local person masking for up to 30 seconds. Nothing is uploaded. Masks
        are sampled at 8 fps and can have rough edges or include other people.
        Masks stay in this tab's memory; prepare them again after a reload or a
        wider trim.
      </p>
      <button
        className="btn s g"
        disabled={busy || !assets.length || !project.clips.length}
        onClick={async () => {
          const controller = new AbortController();
          abort.current = controller;
          setBusy(true);
          setStatus("Loading local model...");
          try {
            await prepareSubjectMasks(
              project,
              assets,
              controller.signal,
              (done, total) => setStatus(`Processing frames ${done}/${total}`),
            );
            setStatus(
              "Masks prepared. Inspect edges and fast hand movements before exporting.",
            );
            refresh((x) => x + 1);
          } catch (e) {
            setStatus(
              e instanceof Error ? e.message : "Mask processing failed.",
            );
          } finally {
            setBusy(false);
            abort.current = null;
          }
        }}
      >
        {ready ? "Prepare masks again" : "Prepare subject masks"}
      </button>
      {busy && (
        <button className="btn s g" onClick={() => abort.current?.abort()}>
          Cancel processing
        </button>
      )}
      <label className="lab">
        Subject look
        <select
          className="field"
          aria-label="Subject look"
          disabled={busy}
          value={project.subjectMode ?? "original"}
          onChange={(e) =>
            change({
              ...project,
              subjectMode: e.target.value as NonNullable<
                EditorProject["subjectMode"]
              >,
            })
          }
        >
          <option value="original">Original footage</option>
          <option value="sticker" disabled={!ready}>
            Real subject sticker
          </option>
          <option value="silhouette" disabled={!ready}>
            Real subject silhouette
          </option>
        </select>
      </label>
      {needsSubjectMasks(project) && !ready && (
        <p role="alert">
          Subject masks are missing for part of this edit. Prepare them before
          preview or export, or choose Original footage.
        </p>
      )}
      <p role="status">{status}</p>
      <h3>Timed subject beats</h3>
      <p>Choose exact seconds on the edited timeline. Outside these beats, the Subject look above applies. Timing is manual, not automatic music-beat detection. Recheck after changing trim or speed.</p>
      <div className="row" style={{ flexWrap: "wrap", alignItems: "end", gap: 10 }}>
        <label className="lab" style={{ flex: "1 1 100px" }}>Start (seconds)<input className="field" aria-label="Subject beat start" type="number" min="0" max={projectDuration(project)} step="0.1" value={beatStart} onChange={e => setBeatStart(e.target.value)} /></label>
        <label className="lab" style={{ flex: "1 1 100px" }}>End (seconds)<input className="field" aria-label="Subject beat end" type="number" min="0" max={projectDuration(project)} step="0.1" value={beatEnd} onChange={e => setBeatEnd(e.target.value)} /></label>
        <label className="lab" style={{ flex: "1 1 150px" }}>Beat look<select className="field" aria-label="Subject beat look" value={beatMode} onChange={e => setBeatMode(e.target.value as typeof beatMode)}><option value="sticker">Real subject sticker</option><option value="silhouette">Real subject silhouette</option></select></label>
        <button className="btn s g" disabled={busy || !ready} onClick={() => {
          if (!beatStart.trim() || !beatEnd.trim()) { setBeatMessage("Enter both start and end seconds."); return; }
          const next = { ...project, subjectBeats: [...(project.subjectBeats ?? []), { id: makeLocalId("beat"), start: Number(beatStart), end: Number(beatEnd), mode: beatMode }] };
          const error = subjectBeatError(next);
          if (error) { setBeatMessage(error); return; }
          change(next); setBeatMessage("Beat added. Preview its start and end before exporting.");
        }}>Add subject beat</button>
      </div>
      {(project.subjectBeats ?? []).map(beat => <div className="row" key={beat.id} style={{ flexWrap: "wrap", gap: 12, marginTop: 10 }}><span>{beat.start.toFixed(2)}-{beat.end.toFixed(2)}s: {beat.mode}</span><button className="btn s g" onClick={() => change({ ...project, subjectBeats: (project.subjectBeats ?? []).filter(b => b.id !== beat.id) })}>Remove beat</button></div>)}
      {subjectBeatError(project) && <p role="alert">{subjectBeatError(project)}</p>}
      <p role="status">{beatMessage}</p>
    </section>
  );
}
