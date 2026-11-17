import { makeLocalId } from "./session-store";
import type { ClipAsset, EditorClip, TranscriptWord } from "./types";

type WhisperChunk = { text: string; timestamp: [number, number | null] };
type WhisperResult = { text?: string; chunks?: WhisperChunk[] };
export type SpeechLanguage = "en" | "hi" | "hinglish";

// Hinglish uses a Whisper-base sized model fine-tuned on Hindi and mixed
// Hindi-English speech that writes Roman letters (Apache 2.0, ~100MB int8). This
// ONNX export keeps cross attentions, so word times are real model timestamps.
const HINGLISH_MODEL = "ishaan-g/whisper-hinglish-swift_timestamped";
const SAMPLE_RATE = 16000;
const WINDOW_S = 25;

async function decodeAudio(url: string): Promise<Float32Array> {
  // Decode and resample explicitly: the library's own URL audio path produced
  // unusable text on clear speech, while Web Audio decode of the same file is clean.
  const response = await fetch(url);
  const encoded = await response.arrayBuffer();
  const probe = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await probe.decodeAudioData(encoded);
  } finally {
    void probe.close();
  }
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE)), SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

function frameEnergy(audio: Float32Array, from: number, to: number, frame: number): number[] {
  const out: number[] = [];
  for (let i = from; i + frame <= to; i += frame) {
    let sum = 0;
    for (let j = i; j < i + frame; j++) { const v = audio[j] ?? 0; sum += v * v; }
    out.push(Math.sqrt(sum / frame));
  }
  return out;
}

/** Cut points near every WINDOW_S seconds, placed at the quietest 100ms found within +-4s. */
function windowCuts(audio: Float32Array): number[] {
  const total = audio.length;
  const cuts: number[] = [0];
  const frame = Math.round(SAMPLE_RATE * 0.1);
  while (total - (cuts[cuts.length - 1] ?? 0) > (WINDOW_S + 4) * SAMPLE_RATE) {
    const target = (cuts[cuts.length - 1] ?? 0) + WINDOW_S * SAMPLE_RATE;
    const from = target - 4 * SAMPLE_RATE;
    const energy = frameEnergy(audio, from, target + 4 * SAMPLE_RATE, frame);
    let best = 0;
    for (let i = 1; i < energy.length; i++) if ((energy[i] ?? 0) < (energy[best] ?? 0)) best = i;
    cuts.push(from + best * frame + frame / 2);
  }
  cuts.push(total);
  return cuts;
}

const CANCEL_MESSAGE = "Transcription cancelled. Clips already finished are kept.";

export async function transcribeClip(clip: EditorClip, asset: ClipAsset, onProgress: (message: string) => void, language: SpeechLanguage = "hinglish", cancelled: () => boolean = () => false): Promise<TranscriptWord[]> {
  const hinglish = language === "hinglish";
  onProgress(hinglish ? "Loading the Hinglish speech model. The first run downloads about 100MB." : "Loading the local Whisper model. The first run downloads model files.");
  const { pipeline, env } = await import("@huggingface/transformers");
  env.allowLocalModels = false;
  const transcriber = await pipeline("automatic-speech-recognition", hinglish ? HINGLISH_MODEL : "Xenova/whisper-base", {
    device: "wasm",
    dtype: "q8",
    progress_callback: (progress: { status?: string; progress?: number }) => {
      if (progress.status === "progress" && typeof progress.progress === "number") onProgress(`Downloading speech model: ${Math.round(progress.progress)}%`);
    },
  });
  if (cancelled()) throw new Error(CANCEL_MESSAGE);
  onProgress(`Reading the audio of ${asset.name}…`);
  const audio = await decodeAudio(asset.url);
  const make = (word: string, start: number, end: number, endInferred = false): TranscriptWord => ({ id: makeLocalId("word"), clipId: clip.originId, word, start, end, ...(endInferred ? { endInferred: true } : {}) });

  const duration = audio.length / SAMPLE_RATE;
  const clean = (chunks: WhisperChunk[], offset: number): TranscriptWord[] => chunks.flatMap((chunk, index) => {
    const word = chunk.text.trim();
    const start = chunk.timestamp?.[0];
    let end = chunk.timestamp?.[1];
    let inferred = false;
    // The model leaves the very last word without an end; use the next word's start or a short tail, clamped to the audio.
    if (typeof start === "number" && (typeof end !== "number" || end <= start)) {
      const next = chunks[index + 1]?.timestamp?.[0];
      end = typeof next === "number" && next > start ? next : Math.min(start + 0.4, duration - offset);
      inferred = true;
    }
    if (!word || typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return [];
    return [make(word, start + offset, end + offset, inferred)];
  });

  if (hinglish) {
    const cuts = windowCuts(audio);
    const out: TranscriptWord[] = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      if (cancelled()) throw new Error(CANCEL_MESSAGE);
      onProgress(`Transcribing Hinglish, part ${i + 1} of ${cuts.length - 1}…`);
      const from = Math.round(cuts[i] ?? 0);
      const to = Math.round(cuts[i + 1] ?? audio.length);
      const output = (await transcriber(audio.slice(from, to), { return_timestamps: "word", language: "hindi", task: "transcribe" })) as WhisperResult | WhisperResult[];
      out.push(...clean((Array.isArray(output) ? output[0] : output)?.chunks ?? [], from / SAMPLE_RATE));
    }
    return out;
  }

  onProgress(`Transcribing ${asset.name} in your browser…`);
  const output = (await transcriber(audio, { return_timestamps: "word", chunk_length_s: 30, stride_length_s: 5, language: language === "hi" ? "hindi" : "english", task: "transcribe" })) as WhisperResult | WhisperResult[];
  const result = Array.isArray(output) ? output[0] : output;
  return clean(result?.chunks ?? [], 0);
}
