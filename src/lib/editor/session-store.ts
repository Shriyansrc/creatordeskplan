import type { ClipAsset } from "./types";

let clips: ClipAsset[] = [];
let exportFile: { blob: Blob; url: string; name: string } | null = null;

export function makeLocalId(prefix: string) {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export async function inspectVideoFile(file: File): Promise<ClipAsset> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error(`${file.name} could not be read as a video`));
    });
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error(`${file.name} has no readable duration`);
    return {
      sourceId: makeLocalId("source"),
      file,
      url,
      name: file.name,
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function addSessionClips(files: File[]) {
  const inspected: ClipAsset[] = [];
  for (const file of files) inspected.push(await inspectVideoFile(file));
  clips = [...clips, ...inspected];
  return inspected;
}

export function removeSessionClip(sourceId: string) {
  const found = clips.find((clip) => clip.sourceId === sourceId);
  clips = clips.filter((clip) => clip.sourceId !== sourceId);
  if (found) URL.revokeObjectURL(found.url);
}

export function getSessionClips() {
  return clips;
}

export function clearSessionExport() {
  if (exportFile) URL.revokeObjectURL(exportFile.url);
  exportFile = null;
}

export function saveSessionExport(blob: Blob, name: string) {
  if (exportFile) URL.revokeObjectURL(exportFile.url);
  const url = URL.createObjectURL(blob);
  exportFile = { blob, url, name };
  return exportFile;
}

export function getSessionExport() {
  return exportFile;
}

export type SectionKey = "hook" | "problem" | "solution" | "cta";
export type GeneratedMedia = { key: string; kind: "voice" | "video"; section: SectionKey; blob: Blob; url: string; name: string; sourceId?: string };
const generated = new Map<string, GeneratedMedia>();

export function setGeneratedMedia(kind: GeneratedMedia["kind"], section: SectionKey, blob: Blob) {
  const key = `${kind}:${section}`;
  removeGeneratedMedia(kind, section);
  const extension = blob.type.includes("webm") ? "webm" : kind === "voice" ? (blob.type.includes("wav") ? "wav" : "mp3") : "mp4";
  const item: GeneratedMedia = { key, kind, section, blob, url: URL.createObjectURL(blob), name: `AI ${kind} - ${section}.${extension}` };
  generated.set(key, item);
  return item;
}

export function getGeneratedMedia(kind: GeneratedMedia["kind"], section: SectionKey) {
  return generated.get(`${kind}:${section}`) ?? null;
}

export function listGeneratedMedia() {
  return Array.from(generated.values());
}

export function removeGeneratedMedia(kind: GeneratedMedia["kind"], section: SectionKey) {
  const found = generated.get(`${kind}:${section}`);
  if (!found) return;
  if (found.sourceId) removeSessionClip(found.sourceId);
  URL.revokeObjectURL(found.url);
  generated.delete(found.key);
}

/** Adds a generated item to the editor clips once; returns its source id. */
export async function sendGeneratedToEditor(item: GeneratedMedia) {
  if (item.sourceId && clips.some((clip) => clip.sourceId === item.sourceId)) return item.sourceId;
  const file = new File([item.blob], item.name, { type: item.blob.type || (item.kind === "voice" ? "audio/mpeg" : "video/mp4") });
  const [asset] = await addSessionClips([file]);
  item.sourceId = asset!.sourceId;
  return item.sourceId;
}

export function removeEditorCopy(item: GeneratedMedia) {
  if (item.sourceId) removeSessionClip(item.sourceId);
  delete item.sourceId;
}
