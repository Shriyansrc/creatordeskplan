import { describe, expect, it } from "vitest";
import { patchDesk, getDesk } from "@/desk/store";

describe("reference scripts preserve existing work", () => {
  it("a reference draft is stored under its own key and leaves the main draft untouched", () => {
    const main = { data: { hook: "mine" } as never, at: "t" };
    patchDesk({ scripts: { t1: main } });
    patchDesk({ scripts: { ...getDesk().scripts, "t1@ref": { data: { hook: "ref" } as never, at: "t2", reference: { source: "s", mode: "video+audio", hookPattern: "h", beats: [], visualPatterns: [], pacing: "" } } } });
    expect(getDesk().scripts["t1"]).toBe(main);
    expect(getDesk().scripts["t1@ref"]?.reference?.source).toBe("s");
  });
});
