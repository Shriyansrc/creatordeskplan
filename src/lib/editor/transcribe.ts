import { makeLocalId } from "./session-store";
import type { ClipAsset, EditorClip, TranscriptWord } from "./types";

type WhisperChunk = { text: string; timestamp: [number, number | null] };
type WhisperResult = { text?: string; chunks?: WhisperChunk[] };

export async function transcribeClip(clip: EditorClip, asset: ClipAsset, onProgress: (message: string) => void, language: "en" | "hi" = "en"): Promise<TranscriptWord[]> {
  onProgress("Loading the local Whisper model. The first run downloads model files.");
  const { pipeline, env } = await import("@huggingface/transformers");
  env.allowLocalModels = false;
  const transcriber = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny", {
    device: "wasm",
    dtype: "q8",
    progress_callback: (progress: { status?: string; progress?: number }) => {
      if (progress.status === "progress" && typeof progress.progress === "number") onProgress(`Loading Whisper model: ${Math.round(progress.progress)}%`);
    },
  });
  onProgress(`Transcribing ${asset.name} in your browser…`);
  const output = (await transcriber(asset.url, { return_timestamps: "word", chunk_length_s: 30, stride_length_s: 5, language: language === "hi" ? "hindi" : "english", task: "transcribe" })) as WhisperResult | WhisperResult[];
  const result = Array.isArray(output) ? output[0] : output;
  const chunks = result?.chunks ?? [];
  return chunks.flatMap((chunk) => {
    const word = chunk.text.trim();
    const start = chunk.timestamp?.[0];
    const end = chunk.timestamp?.[1];
    if (!word || typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return [];
    return [{ id: makeLocalId("word"), clipId: clip.originId, word, start, end }];
  });
        }
