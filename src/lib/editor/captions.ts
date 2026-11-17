import { clipStart } from "./project";
import type { EditorProject, TranscriptWord } from "./types";

export const CAPTION_BREAK = 7 / 30;
const FILLERS = new Set(["a", "an", "the", "and", "or", "but", "to", "of", "in", "on", "at", "for", "is", "it", "i", "you", "we", "they", "this", "that", "so", "um", "uh", "like", "just", "very", "with", "be", "my", "your", "are", "was"]);
export type CaptionCue = { word: TranscriptWord; text: string; start: number; spokenEnd: number; end: number; phrase: number; keyword: boolean };

export function captionText(raw: string, sentenceFirst: boolean) {
  const clean = raw.replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  if (/^i$/i.test(clean)) return "I";
  if (sentenceFirst && /^\p{Lu}/u.test(clean)) return clean.charAt(0) + clean.slice(1).toLowerCase();
  return clean.toLowerCase();
}

export function captionCues(project: EditorProject, transcript: TranscriptWord[]): CaptionCue[] {
  const mapped = project.clips.flatMap((clip) => transcript
    .filter((word) => (word.clipId === clip.originId || word.clipId === clip.id) && word.start >= clip.trimIn && word.start < clip.trimOut && word.end > word.start)
    .map((word) => ({ word, start: clipStart(project, clip.id) + (word.start - clip.trimIn) / clip.speed, spokenEnd: clipStart(project, clip.id) + (Math.min(word.end, clip.trimOut) - clip.trimIn) / clip.speed })))
    .sort((a, b) => a.start - b.start);
  let phrase = 0;
  const cues: CaptionCue[] = mapped.map((item, index) => {
    const prev = mapped[index - 1];
    const next = mapped[index + 1];
    const sentenceFirst = !prev || /[.!?]["'”’]*\s*$/.test(prev.word.word);
    if (prev && (sentenceFirst || item.start - prev.spokenEnd > 0.15 + 1e-6)) phrase++;
    const breakAfter = next && (/[.!?]["'”’]*\s*$/.test(item.word.word) || next.start - item.spokenEnd > 0.15 + 1e-6);
    return { ...item, text: captionText(item.word.word, sentenceFirst), phrase, keyword: false,
      end: next ? Math.max(item.start, next.start - (breakAfter ? CAPTION_BREAK : 0)) : item.spokenEnd };
  });
  const winners = new Map<number, CaptionCue>();
  for (const cue of cues) {
    if (!cue.text || FILLERS.has(cue.text.toLowerCase())) continue;
    const winner = winners.get(cue.phrase);
    if (!winner || cue.text.length > winner.text.length) winners.set(cue.phrase, cue);
  }
  for (const winner of winners.values()) winner.keyword = true;
  return cues;
}

export function captionAt(cues: CaptionCue[], time: number) {
  return cues.find((cue) => time >= cue.start && time < cue.end);
}