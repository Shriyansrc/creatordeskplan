import { describe, expect, it } from "vitest";
import { captionAt, captionCues, captionText, CAPTION_BREAK } from "./captions";
import { createProject, clipFromAsset } from "./project";
import { planSfx } from "./soundtrack";
import { DEFAULT_FISHEYE, lensStrength } from "./fisheye";
import type { ClipAsset, TranscriptWord } from "./types";

function fixture(tokens: [string, number, number][]) {
  const project = createProject();
  project.clips = [{ ...clipFromAsset({ sourceId: "source", name: "speech", duration: 8 } as ClipAsset), id: "clip", originId: "clip" }];
  const words: TranscriptWord[] = tokens.map(([word,start,end],i) => ({ id: String(i), clipId: "clip", word, start, end }));
  return { project, words };
}
describe("saved Font captions", () => {
  it("keeps sentence-initial transcript capitals and I, strips punctuation elsewhere", () => {
    expect(captionText("Hello,", true)).toBe("Hello");
    expect(captionText("hello", true)).toBe("hello");
    expect(captionText("WORLD!", false)).toBe("world");
    expect(captionText("I,", false)).toBe("I");
    const { project, words } = fixture([["Hello,",0,0.3],["WORLD.",0.35,0.6],["Next!",1,1.3]]);
    expect(captionCues(project,words).map((cue) => cue.text)).toEqual(["Hello","world","Next"]);
  });
  it("holds words until the next word for gaps at or below 0.15 seconds", () => {
    const { project, words } = fixture([["one",0,0.2],["two",0.35,0.6]]);
    const cues = captionCues(project,words);
    expect(captionAt(cues,0.34)?.text).toBe("one");
    expect(captionAt(cues,0.35)?.text).toBe("two");
    expect(cues[0]?.end).toBe(0.35);
  });
  it("leaves exactly seven frames blank before next word for gaps over 0.15 seconds", () => {
    const { project, words } = fixture([["one",0,0.2],["two",0.5,0.7]]);
    const cues = captionCues(project,words);
    expect(0.5 - (cues[0]?.end ?? 0)).toBeCloseTo(7/30);
    expect(captionAt(cues,0.3)).toBeUndefined();
    expect(captionAt(cues,0.499)).toBeUndefined();
    expect(captionAt(cues,0.5)?.text).toBe("two");
  });
  it("leaves seven blank frames at a sentence end even without a long audio gap", () => {
    const { project, words } = fixture([["Done.",0,0.5],["Next",0.55,0.8]]);
    const cues = captionCues(project,words);
    expect(cues[0]?.end).toBeCloseTo(0.55-CAPTION_BREAK);
    expect(captionAt(cues,0.4)).toBeUndefined();
  });
  it("highlights one longest non-filler keyword per phrase", () => {
    const { project, words } = fixture([["The",0,0.2],["remarkable",0.22,0.5],["result.",0.52,0.8],["Subscribe",1.5,1.8]]);
    expect(captionCues(project,words).filter((cue) => cue.keyword).map((cue) => cue.text)).toEqual(["remarkable","Subscribe"]);
  });
});
describe("local sound and lens safety", () => {
  it("skips non-exempt sounds overlapping a spoken word", () => {
    const { project, words } = fixture([["Hello",0,0.5],["Subscribe",2,2.5]]);
    project.keywordHighlights = true;
    const { events } = planSfx(project,words);
    expect(events.some((event) => event.kind === "whoosh")).toBe(false);
    expect(events.find((event) => event.kind === "impact")?.time).toBe(0);
    expect(events.find((event) => event.kind === "riser")?.time).toBe(1);
    for (const event of events.filter((event) => event.kind !== "impact" && event.kind !== "pop"))
      expect(words.some((word) => event.time < word.end && event.time + event.duration > word.start)).toBe(false);
  });
  it("ramps enabled fisheye strength and leaves the default off", () => {
    expect(lensStrength(DEFAULT_FISHEYE,2)).toBe(0);
    const settings = { ...DEFAULT_FISHEYE, enabled: true, start: 1, end: 3, strength: 0.6 };
    expect(lensStrength(settings,1)).toBe(0);
    expect(lensStrength(settings,2)).toBeCloseTo(0.3);
    expect(lensStrength(settings,3)).toBe(0.6);
    expect(lensStrength(settings,4)).toBe(0);
  });
});