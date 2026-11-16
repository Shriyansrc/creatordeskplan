import { z } from "zod";

export const voiceJobInputSchema = z.object({
  section: z.enum(["hook", "problem", "solution", "cta"]),
  text: z.string().trim().min(1).max(5000),
  voice: z.string().trim().min(1).max(100),
  speed: z.number().min(0.5).max(2),
  language: z.enum(["en", "hi"]),
});
export type VoiceJobInput = z.infer<typeof voiceJobInputSchema>;

export const videoJobInputSchema = z.object({
  section: z.enum(["hook", "problem", "solution", "cta"]),
  text: z.string().trim().min(1).max(5000),
  prompt: z.string().trim().min(3).max(2000),
  aspectRatio: z.literal("9:16"),
  duration: z.number().int().min(3).max(10),
  referenceImage: z.string().regex(/^data:image\/(png|jpeg|webp);base64,/).max(4_000_000).optional(),
});
export type VideoJobInput = z.infer<typeof videoJobInputSchema>;

export const jobIdSchema = z.string().regex(/^[A-Za-z0-9_-]{6,80}$/);
export const jobStateSchema = z.enum(["queued", "running", "done", "failed", "canceled"]);
export const jobStatusSchema = z.object({ id: jobIdSchema, status: jobStateSchema, mediaUrl: z.string().optional(), error: z.string().max(300).optional() });
export type JobStatus = z.infer<typeof jobStatusSchema>;

/** Replicate prediction payload, validated before use. */
export const predictionSchema = z.object({
  id: jobIdSchema,
  status: z.enum(["starting", "processing", "succeeded", "failed", "canceled"]),
  output: z.unknown().optional(),
  error: z.unknown().optional(),
});
export type Prediction = z.infer<typeof predictionSchema>;

export function mapPredictionStatus(status: Prediction["status"]): JobStatus["status"] {
  return status === "starting" ? "queued" : status === "processing" ? "running" : status === "succeeded" ? "done" : status;
}

export function predictionOutputUrl(output: unknown): string | null {
  const candidate = Array.isArray(output) ? output[0] : typeof output === "object" && output && "url" in output ? (output as { url: unknown }).url : output;
  const parsed = z.string().url().refine((value) => value.startsWith("https://")).safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** VOICE_PROVIDER / VIDEO_PROVIDER format: replicate:owner/model */
export function parseMediaProvider(value: string | undefined) {
  const match = value?.trim().match(/^replicate:([\w.-]+\/[\w.-]+)$/);
  return match ? { kind: "replicate" as const, model: match[1]! } : null;
}
