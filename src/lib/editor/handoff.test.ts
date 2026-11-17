import { describe, it, expect, beforeEach } from "vitest";
import { handoffSnapshot, markHandedOff, mergeSessionClips, resetHandoffForTests } from "./handoff";
import { clipFromAsset, createProject } from "./project";
import type { ClipAsset } from "./types";

const asset = (n: number): ClipAsset => ({ sourceId: `source-${n}`, file: new File([""], `recording-${n}.webm`), url: `blob:${n}`, name: `recording-${n}.webm`, duration: n, width: 720, height: 1280 });
const run = (project: ReturnType<typeof createProject>, assets: ClipAsset[]) => {
  const handed = handoffSnapshot();
  const next = mergeSessionClips(project, assets, handed, clipFromAsset);
  markHandedOff(assets);
  return next;
};

describe("recorded clips reach the editor", () => {
  beforeEach(() => resetHandoffForTests());

  it("adds recordings to an empty timeline in recording order", () => {
    const next = run(createProject(), [asset(1), asset(2), asset(3)]);
    expect(next.clips.map((c) => c.name)).toEqual(["recording-1.webm", "recording-2.webm", "recording-3.webm"]);
  });

  it("adds recordings even when a saved project already has clips (the regression)", () => {
    const saved = { ...createProject(), clips: [clipFromAsset(asset(9))] };
    const next = run(saved, [asset(1), asset(2)]);
    expect(next.clips.map((c) => c.sourceId)).toEqual(["source-9", "source-1", "source-2"]);
    expect(next.clips[0]).toBe(saved.clips[0]); // existing clip untouched
  });

  it("does not duplicate on a second mount or strict-mode double run", () => {
    const first = run(createProject(), [asset(1), asset(2)]);
    const again = run(first, [asset(1), asset(2)]);
    expect(again).toBe(first);
    expect(again.clips).toHaveLength(2);
  });

  it("does not bring back a clip the user removed, but adds a newer recording", () => {
    const first = run(createProject(), [asset(1), asset(2)]);
    const removed = { ...first, clips: first.clips.filter((c) => c.sourceId !== "source-1") };
    const next = run(removed, [asset(1), asset(2), asset(3)]);
    expect(next.clips.map((c) => c.sourceId)).toEqual(["source-2", "source-3"]);
  });

  it("returns the same object when the session has no clips", () => {
    const project = createProject();
    expect(run(project, [])).toBe(project);
  });

  it("keeps clips imported in the editor from being re-added after the user deletes them", () => {
    const imported = [asset(5)];
    markHandedOff(imported);
    const project = createProject();
    expect(run(project, imported)).toBe(project);
  });
});
