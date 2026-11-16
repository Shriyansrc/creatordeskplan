import { describe, expect, it } from "vitest";
import { LocalReelJobService, REEL_JOB_POLL_SECONDS, REEL_WORKER_PICKUP_SECONDS, RemoteReelJobService, reelStatusLabel } from "@/lib/reel-jobs/service";

function memory() { const data = new Map<string, string>(); return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }; }
const brief = { topic: "Exam notes", script: "Hook text", platform: "ig" as const, lengthSeconds: 30, notes: "", videoSource: "upload" as const };

describe("reel jobs", () => {
  it("saves on device only, never as submitted", async () => {
    const job = await new LocalReelJobService(memory()).create(brief, new Blob(["x"], { type: "video/mp4" }));
    expect(job.status).toBe("saved_on_device");
    expect(reelStatusLabel(job)).toBe("Saved on this device, not sent");
  });
  it("rejects a source file over 200 MB", async () => {
    const big = { size: 201 * 1024 * 1024, type: "video/mp4" } as Blob;
    await expect(new LocalReelJobService(memory()).create(brief, big)).rejects.toThrow("200 MB");
  });
  it("remote service is not connected without an endpoint", () => {
    expect(new RemoteReelJobService(null, async () => null).available).toBe(false);
  });
  it("worker pickup cadence is 2 minutes and the list refresh is one constant", () => {
    expect(REEL_WORKER_PICKUP_SECONDS).toBe(120);
    expect(typeof REEL_JOB_POLL_SECONDS).toBe("number");
  });
});
