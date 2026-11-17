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
      {project.subjectMode && project.subjectMode !== "original" && !ready && (
        <p role="alert">
          Subject masks are missing for part of this edit. Prepare them before
          preview or export, or choose Original footage.
        </p>
      )}
      <p role="status">{status}</p>
    </section>
  );
        }
