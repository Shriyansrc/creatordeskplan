import { jobIdSchema, mapPredictionStatus, parseMediaProvider, predictionOutputUrl, predictionSchema, type JobStatus } from "./media-jobs";

const API = "https://api.replicate.com/v1";

export type MediaSettings = { provider: string | undefined; apiKey: string | undefined };

export async function mediaProviderStatus(provider: string | undefined, apiKey: string | undefined) {
  const parsed = parseMediaProvider(provider);
  if (!parsed || !apiKey?.trim()) return false;
  try {
    const response = await fetch(`${API}/account`, { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(8000) });
    return response.ok;
  } catch {
    return false;
  }
}

function configured(settings: MediaSettings) {
  const parsed = parseMediaProvider(settings.provider);
  if (!parsed || !settings.apiKey?.trim()) return null;
  return { model: parsed.model, apiKey: settings.apiKey };
}

export function mediaConfigured(settings: MediaSettings) {
  return configured(settings) !== null;
}

export async function startPrediction(settings: MediaSettings, input: Record<string, unknown>) {
  const config = configured(settings);
  if (!config) throw new Error("not configured");
  const response = await fetch(`${API}/models/${config.model}/predictions`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Provider refused the job with HTTP ${response.status}`);
  return predictionSchema.parse(await response.json());
}

export async function getPrediction(settings: MediaSettings, id: string) {
  const config = configured(settings);
  if (!config) throw new Error("not configured");
  const response = await fetch(`${API}/predictions/${jobIdSchema.parse(id)}`, { headers: { authorization: `Bearer ${config.apiKey}` }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Provider status check failed with HTTP ${response.status}`);
  return predictionSchema.parse(await response.json());
}

export async function cancelPrediction(settings: MediaSettings, id: string) {
  const config = configured(settings);
  if (!config) throw new Error("not configured");
  const response = await fetch(`${API}/predictions/${jobIdSchema.parse(id)}/cancel`, { method: "POST", headers: { authorization: `Bearer ${config.apiKey}` }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Provider cancel failed with HTTP ${response.status}`);
}

export function toJobStatus(prediction: Awaited<ReturnType<typeof getPrediction>>, mediaPath: string): JobStatus {
  const status = mapPredictionStatus(prediction.status);
  if (status === "done") {
    return predictionOutputUrl(prediction.output) ? { id: prediction.id, status, mediaUrl: mediaPath } : { id: prediction.id, status: "failed", error: "Provider finished without a valid media URL" };
  }
  if (status === "failed") return { id: prediction.id, status, error: typeof prediction.error === "string" ? prediction.error.slice(0, 300) : "Provider reported the job failed" };
  return { id: prediction.id, status };
}

/** Shared POST/GET/DELETE handlers for a media job route. */
export function mediaJobHandlers(kind: "voice" | "video", buildInput: (body: unknown) => Record<string, unknown>) {
  const env = () => (kind === "voice" ? { provider: process.env["VOICE_PROVIDER"], apiKey: process.env["VOICE_API_KEY"] } : { provider: process.env["VIDEO_PROVIDER"], apiKey: process.env["VIDEO_API_KEY"] });
  const notConnected = () => Response.json({ connected: false, reason: `${kind === "voice" ? "Voice" : "Video"} generation is not connected` }, { status: 503 });
  const fail = (error: unknown, status = 502) => Response.json({ connected: true, error: error instanceof Error && error.name !== "ZodError" ? error.message.slice(0, 300) : "Provider data did not match the required schema" }, { status });
  return {
    POST: async ({ request }: { request: Request }) => {
      const settings = env();
      if (!mediaConfigured(settings)) return notConnected();
      let input: Record<string, unknown>;
      try { input = buildInput(await request.json()); } catch { return Response.json({ connected: true, error: "Invalid generation request" }, { status: 400 }); }
      try {
        const prediction = await startPrediction(settings, input);
        return Response.json({ connected: true, data: toJobStatus(prediction, `/api/ai/${kind}?id=${prediction.id}&media=1`) });
      } catch (error) { return fail(error); }
    },
    GET: async ({ request }: { request: Request }) => {
      const settings = env();
      if (!mediaConfigured(settings)) return notConnected();
      const url = new URL(request.url);
      const id = jobIdSchema.safeParse(url.searchParams.get("id"));
      if (!id.success) return Response.json({ connected: true, error: "Missing or invalid job id" }, { status: 400 });
      try {
        const prediction = await getPrediction(settings, id.data);
        if (url.searchParams.get("media") === "1") {
          const mediaUrl = prediction.status === "succeeded" ? predictionOutputUrl(prediction.output) : null;
          if (!mediaUrl) return Response.json({ connected: true, error: "Media is not ready" }, { status: 409 });
          const media = await fetch(mediaUrl, { signal: AbortSignal.timeout(60_000) });
          if (!media.ok || !media.body) return Response.json({ connected: true, error: `Media download failed with HTTP ${media.status}` }, { status: 502 });
          return new Response(media.body, { headers: { "content-type": media.headers.get("content-type") ?? (kind === "voice" ? "audio/mpeg" : "video/mp4") } });
        }
        return Response.json({ connected: true, data: toJobStatus(prediction, `/api/ai/${kind}?id=${prediction.id}&media=1`) });
      } catch (error) { return fail(error); }
    },
    DELETE: async ({ request }: { request: Request }) => {
      const settings = env();
      if (!mediaConfigured(settings)) return notConnected();
      const id = jobIdSchema.safeParse(new URL(request.url).searchParams.get("id"));
      if (!id.success) return Response.json({ connected: true, error: "Missing or invalid job id" }, { status: 400 });
      try { await cancelPrediction(settings, id.data); return Response.json({ connected: true, data: { id: id.data, status: "canceled" } }); }
      catch (error) { return fail(error); }
    },
  };
}
