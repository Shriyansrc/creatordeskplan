import { describe, expect, it } from "vitest";
import { patchDesk, getDesk } from "@/desk/store";
import { appendReferenceDraft } from "@/desk/reference-drafts";

describe("reference scripts preserve existing work", () => {
  it("each reference draft has a unique ID and preserves main and legacy drafts", () => {
    const main = { data: { hook: "mine" } as never, at: "t" };
    const reference = { source: "s", mode: "video+audio" as const, hookPattern: "h", beats: [], visualPatterns: [], pacing: "" };
    const legacy = { ...main, reference };
    patchDesk({ scripts: { t1: main, "t1@ref": legacy } });
    patchDesk({ scripts: appendReferenceDraft(getDesk().scripts, "t1", "My topic", { hook: "first" } as never, reference) });
    patchDesk({ scripts: appendReferenceDraft(getDesk().scripts, "t1", "My topic", { hook: "second" } as never, reference) });
    expect(getDesk().scripts["t1"]).toBe(main);
    expect(getDesk().scripts["t1@ref"]).toBe(legacy);
    const added = Object.entries(getDesk().scripts).filter(([k]) => k.startsWith("t1@ref:"));
    expect(added).toHaveLength(2);
    expect(new Set(added.map(([k]) => k)).size).toBe(2);
    expect(added.map(([, v]) => v.data.hook)).toEqual(["first", "second"]);
    expect(added.every(([, v]) => v.reference === reference && v.topicTitle === "My topic")).toBe(true);
  });
});
