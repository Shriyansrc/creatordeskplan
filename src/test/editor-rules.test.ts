import { describe, expect, it } from "vitest";
import { editResponseSchema, planSchema, platformSchema, type EditOperation } from "@/lib/ai/contracts";
import { parseLocalPrompt } from "@/lib/editor/local-prompt";
import { applyOperations, clipFromAsset, createProject } from "@/lib/editor/project";
import type { ClipAsset } from "@/lib/editor/types";

function projectWithClip() {
  const project = createProject();
  const asset = { sourceId: "source-1", name: "take.mp4", duration: 8 } as ClipAsset;
  project.clips = [{ ...clipFromAsset(asset), id: "clip-1", originId: "clip-1" }];
  return project;
}

describe("local prompt editing", () => {
  it("maps crop to vertical to the real 9:16 operation", () => {
    const result = parseLocalPrompt("crop to vertical", projectWithClip());
    expect(result.operations).toContainEqual({ type: "crop", ratio: "9:16" });
  });

  it("maps make it brighter to a 15 point brightness increase", () => {
    const result = parseLocalPrompt("make it brighter", projectWithClip());
    expect(result.operations).toContainEqual({ type: "color", brightness: 115 });
  });

  it("maps remove 1 to 3 to a delete range without touching the source", () => {
    const project = projectWithClip();
    const result = parseLocalPrompt("remove 1 to 3", project);
    const preview = applyOperations(project, result.operations);
    expect(result.operations).toContainEqual({ type: "delete", clipId: "clip-1", start: 1, end: 3 });
    expect(preview.clips.map((clip) => [clip.trimIn, clip.trimOut])).toEqual([[0, 1], [3, 8]]);
    expect(project.clips[0]!.trimIn).toBe(0);
    expect(project.clips[0]!.trimOut).toBe(8);
  });

  it("rejects a prompt it does not understand instead of inventing an edit", () => {
    expect(() => parseLocalPrompt("make this go viral", projectWithClip())).toThrow("Basic mode did not recognize");
  });
});

describe("AI operation safety", () => {
  it("rejects an operation outside the whitelist", () => {
    expect(() => editResponseSchema.parse({ summary: "Unsafe", operations: [{ type: "execute", code: "alert(1)" }] })).toThrow();
  });

  it("accepts only the four owner-approved platform ids", () => {
    expect(["ig", "yt", "li", "x"].every((platform) => platformSchema.safeParse(platform).success)).toBe(true);
    expect(platformSchema.safeParse("other").success).toBe(false);
  });

  it("requires exactly 30 planned topics and 30 calendar entries", () => {
    const topic = { id: "topic-1", title: "One", day: 1, rank: 1, score: 50, reason: "Reason", painPoint: "Pain", kind: "authority", platform: "ig" };
    expect(planSchema.safeParse({ topics: [topic], calendar: [{ day: 1, topicId: "topic-1" }] }).success).toBe(false);
  });

  it("keeps trim changes non-destructive", () => {
    const project = projectWithClip();
    const operations: EditOperation[] = [{ type: "trim", clipId: "clip-1", start: 2, end: 6 }];
    const changed = applyOperations(project, operations);
    expect(changed.clips[0]!.trimIn).toBe(2);
    expect(changed.clips[0]!.trimOut).toBe(6);
    expect(project.clips[0]!.trimOut).toBe(8);
  });
});
