import { DEFAULT_WRAPPING } from "./wrapping";
import { useState } from "react";
import { DEFAULT_FISHEYE } from "./fisheye";
import { planSfx, rememberMusic, hasMusic } from "./soundtrack";
import type { EditorProject, TranscriptWord } from "./types";

export function StyleControls({ project, transcript, change, lens }: { project: EditorProject; transcript: TranscriptWord[]; change: (project: EditorProject) => void; lens: string }) {
  const [error, setError] = useState("");
  const settings = project.fisheye ?? DEFAULT_FISHEYE;
  const updateLens = (patch: Partial<typeof settings>) => change({ ...project, fisheye: { ...settings, ...patch } });
  const highlights = (enabled: boolean) => {
    const next = { ...project, keywordHighlights: enabled };
    change({ ...next, sfx: planSfx(next, transcript).events });
  };
  return <div className="local-style-controls">
    <section aria-label="Caption and sound controls">
      <label className="row"><input type="checkbox" checked={project.keywordHighlights ?? false} onChange={(event) => highlights(event.target.checked)} />Keyword highlight</label>
      <label className="row"><input type="checkbox" checked={project.sfxEnabled ?? false} onChange={(event) => change({ ...project, sfxEnabled: event.target.checked })} />Sound effects</label>
      <p>Sounds are synthesised, not recorded.</p>
      <label className="row"><input type="checkbox" checked={project.wrappingCaptions?.enabled ?? false} onChange={(event) => change({ ...project, wrappingCaptions: { ...DEFAULT_WRAPPING, ...project.wrappingCaptions, enabled: event.target.checked }, captionsEnabled: true })} />Wrapping captions (manual subject placement)</label>
      {project.wrappingCaptions?.enabled && <section><p>Words build in speech-timed groups around this ellipse. This does not track the face. Adjust the centre to keep text away from eyes and mouth. Turn it off to return to Font captions.</p>{([['centreX','Subject centre horizontal',15,85],['centreY','Subject centre vertical',20,70],['radiusX','Horizontal distance',15,35],['radiusY','Vertical distance',10,30]] as const).map(([key,label,min,max])=><label className="lab" key={key}>{label}<input type="range" aria-label={label} min={min} max={max} value={project.wrappingCaptions?.[key] ?? DEFAULT_WRAPPING[key]} onChange={(event)=>change({...project,wrappingCaptions:{...DEFAULT_WRAPPING,...project.wrappingCaptions,[key]:Number(event.target.value)}})} /></label>)}</section>}

      <ul aria-label="SFX list">{(project.sfx ?? []).map((event) => <li key={event.id}>{event.kind === "cameraFlash" ? "camera flash" : event.kind} at {event.time.toFixed(2)}s, {event.duration.toFixed(2)}s. {event.reason}{!project.sfxEnabled ? " (off)" : ""}</li>)}</ul>
    </section>
    <section aria-label="Fisheye panel"><h2>Fisheye</h2>
      <label className="row"><input type="checkbox" checked={settings.enabled} onChange={(event) => updateLens({ enabled: event.target.checked })} />Fisheye on</label>
      <p>{lens || "Renderer checked when a clip is available"}</p>
      {([ ["strength", "Strength", 0, 1], ["curvature", "Curvature", 0.5, 3], ["zoomCompensation", "Zoom Compensation", 0, 1], ["edgeDarken", "Edge Darken", 0, 0.6], ["lensShine", "Lens Shine", 0, 0.5] ] as const).map(([key,label,min,max]) => <label className="lab" key={key}>{label} {settings[key].toFixed(2)}<input aria-label={label} type="range" min={min} max={max} step={0.01} value={settings[key]} onChange={(event) => updateLens({ [key]: Number(event.target.value) })} /></label>)}
      <label className="lab">Start time<input aria-label="Fisheye start time" className="field" type="number" min={0} max={settings.end - 0.1} step={0.1} value={settings.start} onChange={(event) => updateLens({ start: Math.max(0, Math.min(settings.end - 0.1, Number(event.target.value))) })} /></label>
      <label className="lab">End time<input aria-label="Fisheye end time" className="field" type="number" min={settings.start + 0.1} step={0.1} value={settings.end} onChange={(event) => updateLens({ end: Math.max(settings.start + 0.1, Number(event.target.value)) })} /></label>
      <label className="row"><input type="checkbox" checked={settings.grow} onChange={(event) => updateLens({ grow: event.target.checked })} />Grow</label>
    </section>
    <section aria-label="Background music"><h2>Background music</h2>
      <label className="btn s g">Add background music<input aria-label="Add background music" type="file" accept="audio/*" hidden onChange={async (event) => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (!file) return;
        const context = new AudioContext();
        try { await context.decodeAudioData(await file.arrayBuffer()); const assetId = rememberMusic(file); change({ ...project, music: { enabled: true, kind: "file", name: file.name, assetId, level: 0.12 } }); setError(""); }
        catch { setError("That audio file could not be read. Choose another file."); }
        finally { await context.close(); }
      }} /></label>
      <button className="btn s g" onClick={() => change({ ...project, music: { enabled: true, kind: "pad", name: "Synthesised soft pad", level: 0.12 } })}>Use synthesised soft pad</button>
      <label className="row"><input type="checkbox" checked={project.music?.enabled ?? false} disabled={!project.music} onChange={(event) => project.music && change({ ...project, music: { ...project.music, enabled: event.target.checked } })} />Music on</label>
      <p>{project.music?.enabled ? `${project.music.name}, 12% under voice, ducked to 3.6% during speech.` : "No background music applied."}</p>
      {project.music?.kind === "file" && !hasMusic(project.music.assetId) && <p role="alert">Choose {project.music.name} again. Audio files stay in this session only.</p>}
      <p>Choose a file you have permission to use. Named commercial tracks are not supplied.</p>
      {error && <p role="alert">{error}</p>}
    </section>
  </div>;
      }
