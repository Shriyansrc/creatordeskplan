import { captionCues } from "./captions";
import { captionFontString, paintCaptionText } from "./caption-font";
import { captionScale } from "./talking-head";
import type { EditorProject, TranscriptWord } from "./types";

export type ImpactCaption = {
  /** The phrase keyword in caps, drawn big behind the caption words. */
  impact: string;
  /** The current window of normal caption words (max three), with the spoken word flagged. */
  line: { text: string; active: boolean }[];
  phraseStart: number;
};

/**
 * Impact-style captions from real detected word timing only: the keyword of the current
 * phrase stays up for the phrase while the normal words change three at a time.
 * Never derives timing from text length.
 */
export function impactAt(project: EditorProject, words: TranscriptWord[], time: number): ImpactCaption | null {
  const cues = captionCues(project, words);
  const cue = cues.find((item) => time >= item.start && time < item.end);
  if (!cue) return null;
  const phrase = cue.phrase;
  const inPhrase = cues.filter((item) => item.phrase === phrase);
  const keyword = inPhrase.find((item) => item.keyword) ?? cue;
  const activeIndex = cues.findIndex((item) => time >= item.start && time < item.spokenEnd);
  const anchor = activeIndex >= 0 ? activeIndex : cues.indexOf(cue);
  let first = anchor;
  while (first > 0 && cues[first - 1]!.phrase === phrase) first--;
  const group = first + Math.floor((anchor - first) / 3) * 3;
  const line = cues
    .slice(group, group + 3)
    .filter((item) => item.phrase === phrase)
    .map((item) => ({ text: item.text, active: item === cues[activeIndex] }));
  return { impact: keyword.text.toUpperCase(), line, phraseStart: inPhrase[0]?.start ?? cue.start };
}

export function drawImpact(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, project: EditorProject, words: TranscriptWord[], time: number) {
  const cap = impactAt(project, words, time);
  if (!cap) return;
  const style = project.captionStyle;
  const s = canvas.width / 720;
  const centreY = (canvas.height * style.position) / 100;

  context.save();
  const impactSize = style.size * 2.4 * s;
  context.font = captionFontString(style, "impact", impactSize);
  context.textAlign = "center";
  context.textBaseline = "middle";
  const impactWidth = context.measureText(cap.impact).width;
  const fit = Math.min(1, (canvas.width * 0.94) / Math.max(1, impactWidth));
  const pop = (style.animation ?? "pop") === "pop" ? captionScale(time - cap.phraseStart) : 1;
  context.translate(canvas.width / 2, centreY);
  context.scale(fit * pop, fit * pop);
  context.fillStyle = style.impactColor ?? "#E8443A";
  paintCaptionText(context, cap.impact, 0, 0, style, s, "impact", canvas.width * 0.94);
  context.restore();

  context.save();
  const size = style.size * s;
  context.font = captionFontString(style, "caption", size);
  context.textAlign = "left";
  context.textBaseline = "middle";
  const gap = context.measureText(" ").width;
  const widths = cap.line.map((word) => context.measureText(word.text).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * (cap.line.length - 1);
  const lineScale = Math.min(1, (canvas.width * 0.9) / Math.max(1, total));
  context.translate(canvas.width / 2, centreY);
  context.scale(lineScale, lineScale);
  let x = -total / 2;
  cap.line.forEach((word, index) => {
    context.fillStyle = style.karaoke && word.active ? "#FBED4F" : style.color;
    paintCaptionText(context, word.text, x, 0, style, s, "caption");
    x += widths[index]! + gap;
  });
  context.restore();
}
