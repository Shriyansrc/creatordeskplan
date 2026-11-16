import { describe, expect, it } from "vitest";
import { rankCandidates, referencesResultSchema } from "@/lib/references/contracts";

describe("reference ranking", () => {
  it("puts the video whose title matches the idea above a more viewed unrelated one", () => {
    const ranked = rankCandidates([
      { id: "a", title: "Cooking pasta at home", description: "", viewCount: 9_000_000, searchOrder: 0 },
      { id: "b", title: "Revision method for exams", description: "", viewCount: 1_000, searchOrder: 1 },
    ], "exam revision method");
    expect(ranked.map((r) => r.item.id)).toEqual(["b", "a"]);
  });
  it("breaks equal relevance by views", () => {
    const ranked = rankCandidates([
      { id: "low", title: "exam tips", description: "", viewCount: 10, searchOrder: 0 },
      { id: "high", title: "exam tricks", description: "", viewCount: 500, searchOrder: 1 },
    ], "exam");
    expect(ranked[0]!.item.id).toBe("high");
  });
  it("rejects a result without a real view count", () => {
    expect(referencesResultSchema.safeParse({ source: "YouTube Data API v3", videos: [{ id: "x", title: "t", channel: "c", url: "https://youtube.com/watch?v=x", thumbnail: "https://i.ytimg.com/x.jpg", publishedAt: "2026-01-01", why: "w" }] }).success).toBe(false);
  });
});
