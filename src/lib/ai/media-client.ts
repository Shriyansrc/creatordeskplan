import { useEffect, useRef, useState } from "react";
import { jobStatusSchema, type JobStatus } from "./media-jobs";

export const MEDIA_POLL_MS = 4000;
export const MEDIA_TIMEOUT_MS = 10 * 60 * 1000;

export type JobView = { phase: "idle" } | { phase: "starting" } | { phase: "polling"; status: JobStatus["status"]; seconds: number } | { phase: "downloading" } | { phase: "failed"; message: string } | { phase: "done" };

async function readStatus(response: Response) {
  const body = (await response.json()) as { connected?: boolean; reason?: string; error?: string; data?: unknown };
  if (body.connected === false) throw new Error(body.reason ?? "Not connected");
  if (!response.ok || body.error) throw new Error(body.error ?? `HTTP ${response.status}`);
  return jobStatusSchema.parse(body.data);
}

/** Starts one provider job only when run() is called by an explicit click, then polls until done. */
export function useMediaJob(kind: "voice" | "video", onMedia: (blob: Blob) => void) {
  const [view, setView] = useState<JobView>({ phase: "idle" });
  const job = useRef<{ id?: string; stop: boolean; timer?: ReturnType<typeof setTimeout> }>({ stop: true });
  useEffect(() => () => { job.current.stop = true; if (job.current.timer) clearTimeout(job.current.timer); }, []);

  const run = async (input: unknown) => {
    const current = { stop: false } as { id?: string; stop: boolean; timer?: ReturnType<typeof setTimeout> };
    job.current = current;
    const started = Date.now();
    setView({ phase: "starting" });
    try {
      let status = await readStatus(await fetch(`/api/ai/${kind}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }));
      current.id = status.id;
      while (!current.stop && (status.status === "queued" || status.status === "running")) {
        if (Date.now() - started > MEDIA_TIMEOUT_MS) throw new Error("Timed out after 10 minutes. The provider job may still be running; Retry starts a new billed job.");
        setView({ phase: "polling", status: status.status, seconds: Math.round((Date.now() - started) / 1000) });
        await new Promise((resolve) => { current.timer = setTimeout(resolve, MEDIA_POLL_MS); });
        if (current.stop) break;
        status = await readStatus(await fetch(`/api/ai/${kind}?id=${encodeURIComponent(status.id)}`));
      }
      if (current.stop) return;
      if (status.status === "failed" || status.status === "canceled") throw new Error(status.error ?? `Job ${status.status}`);
      if (!status.mediaUrl?.startsWith(`/api/ai/${kind}?`)) throw new Error("Provider returned no media");
      setView({ phase: "downloading" });
      const media = await fetch(status.mediaUrl);
      if (!media.ok) throw new Error(`Media download failed with HTTP ${media.status}`);
      const blob = await media.blob();
      const expected = kind === "voice" ? /^(audio|video)\// : /^video\//;
      if (!expected.test(blob.type) || blob.size === 0) throw new Error("Provider returned a file that is not playable media");
      if (current.stop) return;
      onMedia(blob);
      setView({ phase: "done" });
    } catch (error) {
      if (!current.stop) setView({ phase: "failed", message: error instanceof Error ? error.message : "Generation failed" });
    }
  };

  const cancel = async () => {
    const current = job.current;
    current.stop = true;
    if (current.timer) clearTimeout(current.timer);
    setView({ phase: "failed", message: "Canceled. Nothing was attached." });
    if (current.id) await fetch(`/api/ai/${kind}?id=${encodeURIComponent(current.id)}`, { method: "DELETE" }).catch(() => undefined);
  };

  return { view, run, cancel, busy: view.phase === "starting" || view.phase === "polling" || view.phase === "downloading" };
}
