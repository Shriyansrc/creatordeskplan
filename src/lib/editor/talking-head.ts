import type { SilenceRange } from "./audio";
import { applyOperations, clipDuration, clipStart, projectDuration, wordTimelineTime } from "./project";
import type { EditorProject, PushIn, TranscriptWord } from "./types";
import { editOperationSchema } from "./contracts";

export function pushInScale(push: PushIn, time: number) {
  const t = Math.max(0, Math.min(1, (time - push.start) / push.duration));
  return push.from + (push.to - push.from) * t * t * (3 - 2 * t);
}

export function timelineZoom(project: EditorProject, time: number) {
  return (project.pushIns ?? []).reduce((scale, push) => scale * pushInScale(push, time), 1);
}

export function captionScale(elapsed: number) {
  return 0.85 + 0.15 * Math.max(0, Math.min(1, elapsed / (3 / 30)));
}

// Audio detection alone is not proof of silence. Only remove internal gaps
// covered by timestamps, subtract every spoken interval, and retain both edges.
export function safeSilenceRanges(project: EditorProject, transcript: TranscriptWord[], detected: SilenceRange[], tail = 0.12): SilenceRange[] {
  const result: SilenceRange[] = [];
  for (const clip of project.clips) {
    const words = transcript.filter((word) => (word.clipId === clip.originId || word.clipId === clip.id) && word.end > clip.trimIn && word.start < clip.trimOut)
      .sort((a, b) => a.start - b.start);
    const intervals: { start: number; end: number }[] = [];
    for (const word of words) {
      const previous = intervals.at(-1);
      if (previous && word.start <= previous.end) previous.end = Math.max(previous.end, word.end);
      else intervals.push({ start: word.start, end: word.end });
    }
    for (let i = 1; i < intervals.length; i++) {
      const previous = intervals[i - 1];
      const next = intervals[i];
      if (!previous || !next) continue;
      for (const range of detected.filter((item) => item.clipId === clip.id)) {
        const start = Math.max(clip.trimIn, previous.end + tail * clip.speed, range.start + tail * clip.speed);
        const end = Math.min(clip.trimOut, next.start - 0.04 * clip.speed, range.end - 0.04 * clip.speed);
        if (end > start) result.push({ clipId: clip.id, start, end });
      }
    }
  }
  // Merge detector overlaps so removed seconds and resulting timeline agree.
  const merged: SilenceRange[] = [];
  for (const range of result.sort((a, b) => a.clipId.localeCompare(b.clipId) || a.start - b.start)) {
    const previous = merged.at(-1);
    if (previous && previous.clipId === range.clipId && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

export const NOT_AVAILABLE = ["Fisheye lens effect", "Sound effects", "Background music", "Rounded wrapping text around the person", "Bubbly motion graphics", "Character replacement"];
export type StyleResult = { project: EditorProject; changed: string[]; couldNot: string[] };

export function applyTalkingHeadStyle(original: EditorProject, transcript: TranscriptWord[], detected: SilenceRange[], detectionFailures: string[] = []): StyleResult {
  const changed: string[] = [];
  const couldNot = [...detectionFailures];
  let project = applyOperations(original, []);
  const timedWords = transcript.filter((word) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start);
  const first = timedWords.map((word) => ({ word, time: wordTimelineTime(project, word) }))
    .filter((item): item is { word: TranscriptWord; time: number } => item.time !== null).sort((a, b) => a.time - b.time)[0];
  const unverifiedLead = first && project.clips.some((clip) => clipStart(project, clip.id) < first.time &&
    !timedWords.some((word) => (word.clipId === clip.originId || word.clipId === clip.id) && word.end > clip.trimIn && word.start < clip.trimOut));
  if (first && first.time > 1 && !unverifiedLead) {
    const cutoff = first.time - 0.5;
    const ranges = project.clips.flatMap((clip) => {
      const start = clipStart(project, clip.id);
      const amount = Math.min(clipDuration(clip), Math.max(0, cutoff - start));
      return amount > 0 ? [{ clipId: clip.id, start: clip.trimIn, end: clip.trimIn + amount * clip.speed }] : [];
    });
    project = applyOperations(project, [{ type: "removeSilence", ranges }]);
    changed.push(`Hook lead-in shortened by ${cutoff.toFixed(2)} seconds. First spoken word now starts at 0.50 seconds.`);
  } else if (first && unverifiedLead) couldNot.push("Hook trim skipped: earlier clips have no word timestamps, so their speech cannot safely be removed.");
  else if (first) changed.push(`Hook lead-in unchanged. First spoken word starts at ${first.time.toFixed(2)} seconds.`);
  else couldNot.push("Hook trim skipped: no word timestamps on the current timeline. Transcribe locally first.");

  // Splitting lead-in changes segment ids. Map the detected ranges to surviving segments.
  const remapped = project.clips.flatMap((clip) => {
    const source = original.clips.find((item) => item.id === clip.id || (item.originId === clip.originId && item.trimIn <= clip.trimIn && item.trimOut >= clip.trimOut));
    return detected.filter((range) => range.clipId === source?.id).map((range) => ({ ...range, clipId: clip.id }));
  });
  const ranges = safeSilenceRanges(project, timedWords, remapped);
  const before = projectDuration(project);
  project = applyOperations(project, [{ type: "removeSilence", ranges }]);
  changed.push(`Dead air removed: ${(before - projectDuration(project)).toFixed(2)} seconds. Kept at least 0.12 seconds after spoken lines and 0.04 seconds before the next word.`);
  if (!first) couldNot.push("Dead-air cuts skipped without word timestamps to protect spoken words.");
  else if (!ranges.length && !detectionFailures.length) changed.push("No safely removable internal silent gaps found.");

  project = applyOperations(project, [editOperationSchema.parse({ type: "pushIn", start: 0, duration: 2.5, from: 1, to: 1.08 }), { type: "captions", enabled: true, style: "owner" }, { type: "color", brightness: 100, contrast: 108, saturation: 92, temperature: 0 }]);
  project.captionStyle = { preset: "owner", size: 58, color: "#F4F1EA", position: 60 };
  const punches = project.clips.reduce((count, clip) => count + clip.zooms.length, 0);
  const existingPushes = project.pushIns?.length ?? 0;
  project.pushIns = [{ start: 0, duration: 2.5, from: 1, to: 1.08 }];
  project.clips = project.clips.map((clip) => ({ ...clip, zooms: [], color: { ...clip.color, navyShadows: 0.06, vignette: 0.25 } }));
  if (punches) changed.push(`Removed ${punches} fixed zoom punch(es) so they do not interrupt the slow push-in.`);
  if (existingPushes > 1) changed.push("Replaced overlapping push-ins with one opening ramp.");
  changed.push("Opening push-in: eased 1.00 to 1.08 over 2.50 seconds, then held.");
  changed.push("Font caption style set: lowercase Poppins ExtraBold Italic, cream-white, soft shadow, no box or outline, tight tracking, centered at 60% height. Word timestamps drive hard cuts and a 3-frame scale-in.");
  if (!first) couldNot.push("Captions cannot appear until a timestamped transcript is available.");
  const missing = project.clips.filter((clip) => !timedWords.some((word) => (word.clipId === clip.originId || word.clipId === clip.id) && word.end > clip.trimIn && word.start < clip.trimOut));
  if (first && missing.length) couldNot.push(`No word timestamps for ${new Set(missing.map((clip) => clip.name)).size} clip(s). Captions and silence cuts skipped there.`);
  changed.push("Face grade: saturation 92%, contrast 108%, mild navy shadows and a 25% edge vignette. No global skin-color cast.");
  couldNot.push("Caption placement uses the chest line, not mouth tracking. Check framing if the mouth is unusually low.");
  return { project, changed, couldNot };
}