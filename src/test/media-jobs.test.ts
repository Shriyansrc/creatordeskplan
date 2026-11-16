import { describe, expect, it } from "vitest";
import { mapPredictionStatus, parseMediaProvider, predictionOutputUrl, videoJobInputSchema } from "@/lib/ai/media-jobs";

describe("media jobs", () => {
  it("maps provider states to queued, running, done", () => {
    expect(["starting", "processing", "succeeded"].map((s) => mapPredictionStatus(s as "starting"))).toEqual(["queued", "running", "done"]);
  });
  it("rejects video length outside 3 to 10 seconds", () => {
    const base = { section: "hook", text: "t", prompt: "a shot", aspectRatio: "9:16" };
    expect(videoJobInputSchema.safeParse({ ...base, duration: 11 }).success).toBe(false);
    expect(videoJobInputSchema.safeParse({ ...base, duration: 2 }).success).toBe(false);
    expect(videoJobInputSchema.safeParse({ ...base, duration: 10 }).success).toBe(true);
  });
  it("only accepts 9:16 video", () => {
    expect(videoJobInputSchema.safeParse({ section: "hook", text: "t", prompt: "a shot", aspectRatio: "16:9", duration: 5 }).success).toBe(false);
  });
  it("rejects non-https media output", () => {
    expect(predictionOutputUrl("http://x.test/a.mp4")).toBeNull();
    expect(predictionOutputUrl(["https://x.test/a.mp4"])).toBe("https://x.test/a.mp4");
  });
  it("needs replicate:owner/model as the provider", () => {
    expect(parseMediaProvider("replicate:acme/tts")).toEqual({ kind: "replicate", model: "acme/tts" });
    expect(parseMediaProvider("acme")).toBeNull();
  });
});
