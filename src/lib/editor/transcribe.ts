import { makeLocalId } from "./session-store";
import type { ClipAsset, EditorClip, TranscriptWord } from "./types";

type WhisperChunk = { text: string; timestamp: [number, number | null] };
type WhisperResult = { text?: string; chunks?: WhisperChunk[] };

export async function transcribeClip(clip: EditorClip, asset: ClipAsset, onProgress: (message: string) => void, language: "en" | "hi" = "en"): Promise<TranscriptWord[]> {
  onProgress("Loading the local Whisper model. The first run downloads model files.");
  const { pipeline, env } = await import("@huggingface/transformers");
  env.allowLocalModels = false;
  const transcriber = await pipeline("automatic-speech-recognition", "Xenova/whisper-base", {
    device: "wasm",
    dtype: "q8",
    progress_callback: (progress: { status?: string; progress?: number }) => {
      if (progress.status === "progress" && typeof progress.progress === "number") onProgress(`Loading Whisper model: ${Math.round(progress.progress)}%`);
    },
  });
  onProgress(`Transcribing ${asset.name} in your browser…`);
  // Decode and resample explicitly instead of passing the URL to the pipeline:
  // the library's own URL audio path produced unusable text on verified clear
  // speech, while Web Audio decode of the same file is clean.
  const response = await fetch(asset.url);
  const encoded = await response.arrayBuffer();
  const probe = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await probe.decodeAudioData(encoded);
  } finally {
    void probe.close();
  }
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  const audio = rendered.getChannelData(0);
  const output = (await transcriber(audio, { return_timestamps: "word", chunk_length_s: 30, stride_length_s: 5, language: language === "hi" ? "hindi" : "english", task: "transcribe" })) as WhisperResult | WhisperResult[];
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
