import { describe, expect, it } from "vitest";
import { impactAt } from "./impact";
import { createProject, clipFromAsset } from "./project";
import type { ClipAsset, TranscriptWord } from "./types";

function asset(duration: number): ClipAsset {
  return { sourceId: "src1", file: new File([], "talk.mp4"), url: "blob:x", name: "talk.mp4", duration, width: 720, height: 1280 };
}

function words(): TranscriptWord[] {
  return [
    { id: "w1", clipId: "", word: "this", start: 0.0, end: 0.2 },
    { id: "w2", clipId: "", word: "is", start: 0.22, end: 0.34 },
    { id: "w3", clipId: "", word: "instinct", start: 0.36, end: 0.7 },
    { id: "w4", clipId: "", word: "and", start: 0.72, end: 0.84 },
    { id: "w5", clipId: "", word: "timing", start: 0.86, end: 1.2 },
  ];
}

describe("impact captions", () => {
  const project = createProject();
  const clip = clipFromAsset(asset(8));
  project.clips = [clip];
  const transcript = words().map((word) => ({ ...word, clipId: clip.originId }));

  it("keeps the phrase keyword up as the impact word behind three-word windows", () => {
    const cap = impactAt(project, transcript, 0.4);
    expect(cap).not.toBeNull();
    expect(cap?.impact).toBe("INSTINCT");
    expect(cap?.line.map((item) => item.text)).toEqual(["this", "is", "instinct"]);
    expect(cap?.line.find((item) => item.active)?.text).toBe("instinct");
  });

  it("slides the word window and keeps the keyword through the phrase", () => {
    const cap = impactAt(project, transcript, 1.0);
    expect(cap?.impact).toBe("INSTINCT");
    expect(cap?.line.map((item) => item.text)).toEqual(["and", "timing"]);
    expect(cap?.line.find((item) => item.active)?.text).toBe("timing");
  });

  it("shows nothing outside spoken caption time and never invents timing", () => {
    expect(impactAt(project, transcript, 7.5)).toBeNull();
    expect(impactAt(project, [], 0.5)).toBeNull();
  });
});
