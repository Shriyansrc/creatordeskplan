import type { EditOperation } from "./contracts";
import { makeLocalId } from "./session-store";
import type { ClipAsset, EditorClip, EditorProject, TranscriptWord } from "./types";

export const DEFAULT_COLOR = { brightness: 100, contrast: 100, saturation: 100, temperature: 0 };
export const DEFAULT_CROP = { x: 0, y: 0, zoom: 1 };

export function createProject(): EditorProject {
  return {
    clips: [],
    ratio: "9:16",
    captionsEnabled: true,
    captionStyle: { preset: "owner", size: 58, color: "#F4F1EA", position: 50 },
    overlays: [],
  };
}

export function clipFromAsset(asset: ClipAsset): EditorClip {
  const id = makeLocalId("clip");
  return {
    id,
    originId: id,
    sourceId: asset.sourceId,
    name: asset.name,
    trimIn: 0,
    trimOut: asset.duration,
    sourceDuration: asset.duration,
    speed: 1,
    volume: 1,
    muted: false,
    crop: { ...DEFAULT_CROP },
    color: { ...DEFAULT_COLOR },
    zooms: [],
  };
}

export function clipDuration(clip: EditorClip) {
  return Math.max(0, (clip.trimOut - clip.trimIn) / clip.speed);
}

export function projectDuration(project: EditorProject) {
  return project.clips.reduce((sum, clip) => sum + clipDuration(clip), 0);
}

export function clipStart(project: EditorProject, clipId: string) {
  let start = 0;
  for (const clip of project.clips) {
    if (clip.id === clipId) return start;
    start += clipDuration(clip);
  }
  return 0;
}

export function locateTime(project: EditorProject, time: number) {
  let start = 0;
  for (const clip of project.clips) {
    const duration = clipDuration(clip);
    if (time < start + duration || clip === project.clips.at(-1)) {
      return { clip, start, sourceTime: clip.trimIn + Math.max(0, time - start) * clip.speed };
    }
    start += duration;
  }
  return null;
}

export function wordTimelineTime(project: EditorProject, word: TranscriptWord) {
  const clip = project.clips.find((item) => (item.originId === word.clipId || item.id === word.clipId) && word.start >= item.trimIn && word.start <= item.trimOut);
  if (!clip) return null;
  return clipStart(project, clip.id) + (word.start - clip.trimIn) / clip.speed;
}

export function activeWord(project: EditorProject, transcript: TranscriptWord[], clip: EditorClip, sourceTime: number) {
  const timelineTime = clipStart(project, clip.id) + (sourceTime - clip.trimIn) / clip.speed;
  return transcript.find((word) => {
    if (word.clipId !== clip.originId && word.clipId !== clip.id) return false;
    const start = wordTimelineTime(project, word);
    if (start === null) return false;
    const duration = Math.max(0, (Math.min(word.end, clip.trimOut) - word.start) / clip.speed);
    return timelineTime >= start && timelineTime < start + duration;
  });
}

function cloneProject(project: EditorProject): EditorProject {
  return JSON.parse(JSON.stringify(project)) as EditorProject;
}

function targets(project: EditorProject, clipId?: string) {
  return project.clips.filter((clip) => !clipId || clip.id === clipId);
}

function removeRanges(project: EditorProject, ranges: { clipId: string; start: number; end: number }[]) {
  for (const clip of [...project.clips]) {
    const relevant = ranges
      .filter((range) => range.clipId === clip.id && range.end > range.start)
      .map((range) => ({ start: Math.max(clip.trimIn, range.start), end: Math.min(clip.trimOut, range.end) }))
      .filter((range) => range.end > range.start)
      .sort((a, b) => a.start - b.start);
    if (!relevant.length) continue;
    const segments: EditorClip[] = [];
    let cursor = clip.trimIn;
    for (const range of relevant) {
      if (range.start > cursor) segments.push({ ...clip, id: makeLocalId("clip"), trimIn: cursor, trimOut: range.start, crop: { ...clip.crop }, color: { ...clip.color }, zooms: [...clip.zooms] });
      cursor = Math.max(cursor, range.end);
    }
    if (clip.trimOut > cursor) segments.push({ ...clip, id: makeLocalId("clip"), trimIn: cursor, trimOut: clip.trimOut, crop: { ...clip.crop }, color: { ...clip.color }, zooms: [...clip.zooms] });
    const index = project.clips.findIndex((item) => item.id === clip.id);
    project.clips.splice(index, 1, ...segments);
  }
}

export function applyOperations(original: EditorProject, operations: EditOperation[]): EditorProject {
  const project = cloneProject(original);
  for (const operation of operations) {
    if (operation.type === "pushIn") {
      project.pushIns = [...(project.pushIns ?? []).filter((item) => item.start !== operation.start), {
        start: operation.start, duration: operation.duration, from: operation.from, to: operation.to,
      }];
      continue;
    }
    if (operation.type === "removeSilence") {
      if (operation.ranges?.length) removeRanges(project, operation.ranges);
      continue;
    }
    if (operation.type === "captions") {
      project.captionsEnabled = operation.enabled;
      if (operation.style) project.captionStyle.preset = operation.style;
      continue;
    }
    if (operation.type === "textOverlay") {
      if (operation.end > operation.start) project.overlays.push({ id: makeLocalId("overlay"), text: operation.text, start: operation.start, end: operation.end });
      continue;
    }
    if (operation.type === "crop") {
      project.ratio = operation.ratio;
      for (const clip of targets(project, operation.clipId)) {
        clip.crop = { x: operation.x ?? clip.crop.x, y: operation.y ?? clip.crop.y, zoom: operation.zoom ?? clip.crop.zoom };
      }
      continue;
    }
    if (operation.type === "color") {
      for (const clip of targets(project, operation.clipId)) {
        clip.color = {
          ...clip.color,
          brightness: operation.brightness ?? clip.color.brightness,
          contrast: operation.contrast ?? clip.color.contrast,
          saturation: operation.saturation ?? clip.color.saturation,
          temperature: operation.temperature ?? clip.color.temperature,
        };
      }
      continue;
    }
    if (operation.type === "speed") {
      for (const clip of targets(project, operation.clipId)) clip.speed = operation.value;
      continue;
    }
    if (operation.type === "volume") {
      for (const clip of targets(project, operation.clipId)) {
        clip.volume = operation.value;
        if (operation.muted !== undefined) clip.muted = operation.muted;
      }
      continue;
    }
    if (operation.type === "zoom") {
      for (const clip of targets(project, operation.clipId)) {
        if (operation.end > operation.start) clip.zooms.push({ id: makeLocalId("zoom"), start: operation.start, end: operation.end, scale: operation.scale });
      }
      continue;
    }
    const index = project.clips.findIndex((clip) => clip.id === operation.clipId);
    if (index < 0) continue;
    const clip = project.clips[index];
    if (!clip) continue;
    if (operation.type === "trim") {
      const start = Math.max(0, Math.min(operation.start, clip.sourceDuration - 0.05));
      const end = Math.max(start + 0.05, Math.min(operation.end, clip.sourceDuration));
      clip.trimIn = start;
      clip.trimOut = end;
    } else if (operation.type === "split") {
      if (operation.at > clip.trimIn + 0.04 && operation.at < clip.trimOut - 0.04) {
        const right: EditorClip = { ...clip, id: makeLocalId("clip"), trimIn: operation.at, crop: { ...clip.crop }, color: { ...clip.color }, zooms: [...clip.zooms] };
        clip.trimOut = operation.at;
        project.clips.splice(index + 1, 0, right);
      }
    } else if (operation.type === "delete") {
      if (operation.start !== undefined && operation.end !== undefined) removeRanges(project, [{ clipId: clip.id, start: operation.start, end: operation.end }]);
      else project.clips.splice(index, 1);
    } else if (operation.type === "reorder") {
      project.clips.splice(index, 1);
      project.clips.splice(Math.min(operation.toIndex, project.clips.length), 0, clip);
    }
  }
  return project;
}

export function describeOperation(operation: EditOperation) {
  switch (operation.type) {
    case "trim": return `Trim ${operation.clipId} to ${operation.start.toFixed(1)}–${operation.end.toFixed(1)}s`;
    case "split": return `Split at ${operation.at.toFixed(1)}s`;
    case "delete": return operation.start !== undefined ? `Remove ${operation.start.toFixed(1)}–${operation.end?.toFixed(1)}s` : "Delete clip";
    case "reorder": return `Move clip to position ${operation.toIndex + 1}`;
    case "speed": return `Set speed to ${operation.value}x`;
    case "volume": return operation.muted ? "Mute audio" : `Set volume to ${Math.round(operation.value * 100)}%`;
    case "crop": return `Crop to ${operation.ratio}`;
    case "color": return "Adjust color";
    case "removeSilence": return `Remove ${operation.ranges?.length ?? 0} detected silent sections`;
    case "captions": return operation.enabled ? "Turn captions on" : "Turn captions off";
    case "textOverlay": return `Add text: ${operation.text}`;
    case "zoom": return `Add ${operation.scale}x punch-in`;
    case "pushIn": return `Slow push-in from ${operation.from.toFixed(2)} to ${operation.to.toFixed(2)} over ${operation.duration}s`;
  }
}
