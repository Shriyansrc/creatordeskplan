import type { ClipAsset, EditorClip, EditorProject } from "./types";

/**
 * Clips recorded or imported in this browser session are handed to the editor once, in the order they were added.
 * A project saved from an earlier visit may already hold clips, so the handoff cannot depend on an empty timeline.
 * Existing clips are never removed or reordered; new session clips go after them.
 */
const KEY = "cd:handed-off";
const handedOff = new Set<string>();
let loaded = false;
function load() {
  if (loaded) return;
  loaded = true;
  try {
    const saved = typeof window === "undefined" ? null : window.localStorage.getItem(KEY);
    if (saved) for (const id of JSON.parse(saved) as string[]) handedOff.add(id);
  } catch { /* unreadable marker: treat as empty */ }
}
function save() {
  try { window.localStorage.setItem(KEY, JSON.stringify([...handedOff])); } catch { /* session-only is fine */ }
}

export function handoffSnapshot(): ReadonlySet<string> {
  load();
  return new Set(handedOff);
}

export function markHandedOff(assets: ClipAsset[]) {
  load();
  for (const asset of assets) handedOff.add(asset.sourceId);
  save();
}

export function resetHandoffForTests() {
  handedOff.clear();
  loaded = false;
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Pure. Returns the same project object when there is nothing new to add. */
export function mergeSessionClips(project: EditorProject, assets: ClipAsset[], handed: ReadonlySet<string>, make: (asset: ClipAsset) => EditorClip): EditorProject {
  const referenced = new Set(project.clips.map((clip) => clip.sourceId));
  const fresh = assets.filter((asset) => !handed.has(asset.sourceId) && !referenced.has(asset.sourceId));
  if (!fresh.length) return project;
  return { ...project, clips: [...project.clips, ...fresh.map(make)] };
}
