import { describe, expect, it } from "vitest";
import { applyOperations, clipFromAsset, createProject, activeWord, projectDuration, wordTimelineTime } from "./project";
import { applyTalkingHeadStyle, captionScale, pushInScale, safeSilenceRanges, timelineZoom } from "./talking-head";
import { editOperationSchema } from "./contracts";
import type { ClipAsset, TranscriptWord } from "./types";

function fixture() {
  const project = createProject();
  project.clips = [{ ...clipFromAsset({ sourceId: "source", duration: 8, name: "take.webm" } as ClipAsset), id: "clip", originId: "clip" }];
  return project;
}
const words: TranscriptWord[] = [
  { id: "a", clipId: "clip", word: "hello", start: 2, end: 2.5 },
  { id: "b", clipId: "clip", word: "world", start: 4, end: 4.7 },
];

describe("talking-head rules", () => {
  it("ramps smoothly from 1.00 to 1.08 for 2.5 seconds and holds thereafter", () => {
    const push = { start: 0, duration: 2.5, from: 1, to: 1.08 };
    expect(pushInScale(push, -1)).toBe(1);
    expect(pushInScale(push, 0)).toBe(1);
    expect(pushInScale(push, 0.625)).toBeCloseTo(1.0125);
    expect(pushInScale(push, 1.25)).toBeCloseTo(1.04);
    expect(pushInScale(push, 2.5)).toBe(1.08);
    expect(pushInScale(push, 5)).toBe(1.08);
    expect(pushInScale(push, 0.01) - 1).toBeLessThan(0.00001);
    const operation = editOperationSchema.parse({ type: "pushIn", ...push });
    const project = applyOperations(fixture(), [operation]);
    expect(timelineZoom(project, 1.25)).toBeCloseTo(1.04);
    expect(fixture().pushIns).toBeUndefined();
  });

  it("retains 0.12 seconds after speech, protects the next word, and removes only silence", () => {
    const project = fixture();
    const ranges = safeSilenceRanges(project, words, [{ clipId: "clip", start: 2.5, end: 4 }]);
    expect(ranges).toEqual([{ clipId: "clip", start: 2.62, end: 3.96 }]);
    const edited = applyOperations(project, [{ type: "removeSilence", ranges }]);
    expect(edited.clips[0]?.trimOut).toBe(2.62);
    expect(edited.clips[1]?.trimIn).toBe(3.96);
    expect(projectDuration(project) - projectDuration(edited)).toBeCloseTo(1.34);
    expect(wordTimelineTime(edited, words[1] as TranscriptWord)).toBeCloseTo(2.66);
  });

  it("does not cut detected quiet spoken words or untranscribed audio", () => {
    const detected = [{ clipId: "clip", start: 1, end: 6 }];
    const ranges = safeSilenceRanges(fixture(), words, detected);
    expect(ranges).toEqual([{ clipId: "clip", start: 2.62, end: 3.96 }]);
    expect(safeSilenceRanges(fixture(), [], detected)).toEqual([]);
  });

  it("keeps the 0.12 second tail in timeline time at double speed", () => {
    const project = fixture();
    const clip = project.clips[0];
    if (clip) clip.speed = 2;
    const ranges = safeSilenceRanges(project, words, [{ clipId: "clip", start: 2.5, end: 4 }]);
    expect(ranges[0]?.start).toBeCloseTo(2.74);
    expect(ranges[0]?.end).toBeCloseTo(3.92);
  });

  it("uses actual word intervals and leaves pauses over 0.3 seconds blank", () => {
    const project = fixture();
    const clip = project.clips[0];
    if (!clip) throw new Error("Missing fixture clip");
    expect(activeWord(project, words, clip, 2)?.word).toBe("hello");
    expect(activeWord(project, words, clip, 2.5)).toBeUndefined();
    expect(activeWord(project, words, clip, 3)).toBeUndefined();
    expect(activeWord(project, words, clip, 4)?.word).toBe("world");
  });

  it("scales the caption from 85% to 100% in 3 frames at 30fps", () => {
    expect(captionScale(0)).toBe(0.85);
    expect(captionScale(1 / 30)).toBeCloseTo(0.9);
    expect(captionScale(3 / 30)).toBe(1);
    expect(captionScale(0.5)).toBe(1);
  });

  it("sets the Font chest-line style", () => {
    const result = applyTalkingHeadStyle(fixture(), words, []);
    expect(result.project.captionStyle).toEqual({ preset: "owner", size: 58, color: "#F4F1EA", position: 60 });
    expect(result.project.captionsEnabled).toBe(true);
  });

  it("sets mild face grading with 92% saturation, 108% contrast and 25% vignette", () => {
    const result = applyTalkingHeadStyle(fixture(), words, []);
    expect(result.project.clips[0]?.color).toEqual({ brightness: 100, saturation: 92, contrast: 108, temperature: 0, navyShadows: 0.06, vignette: 0.25 });
  });

  it("trims late first speech to 0.5 seconds without changing the original", () => {
    const project = fixture();
    const result = applyTalkingHeadStyle(project, words, []);
    expect(wordTimelineTime(result.project, words[0] as TranscriptWord)).toBeCloseTo(0.5);
    expect(project.clips[0]?.trimIn).toBe(0);
  });

  it("does not trim a hook already within the first second", () => {
    const early = [{ ...words[0] as TranscriptWord, start: 0.8, end: 1.2 }];
    const result = applyTalkingHeadStyle(fixture(), early, []);
    expect(result.project.clips[0]?.trimIn).toBe(0);
  });
});