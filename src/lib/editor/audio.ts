import type { ClipAsset, EditorClip } from "./types";

export type SilenceRange = { clipId: string; start: number; end: number };

export async function detectSilence(clip: EditorClip, asset: ClipAsset, threshold = 0.025, minDuration = 0.35): Promise<SilenceRange[]> {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) throw new Error("This browser cannot analyze audio.");
  const context = new AudioContextClass();
  try {
    const buffer = await context.decodeAudioData(await asset.file.arrayBuffer());
    const channel = buffer.getChannelData(0);
    const windowSize = Math.max(1, Math.floor(buffer.sampleRate * 0.02));
    const ranges: SilenceRange[] = [];
    let silentStart: number | null = null;
    for (let offset = 0; offset < channel.length; offset += windowSize) {
      const endOffset = Math.min(channel.length, offset + windowSize);
      let sum = 0;
      for (let i = offset; i < endOffset; i++) {
        const sample = channel[i] ?? 0;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / Math.max(1, endOffset - offset));
      const time = offset / buffer.sampleRate;
      if (rms < threshold && silentStart === null) silentStart = time;
      if ((rms >= threshold || endOffset === channel.length) && silentStart !== null) {
        const end = endOffset / buffer.sampleRate;
        if (end - silentStart >= minDuration) {
          const startClamped = Math.max(clip.trimIn, silentStart);
          const endClamped = Math.min(clip.trimOut, end);
          if (endClamped - startClamped >= minDuration) ranges.push({ clipId: clip.id, start: startClamped, end: endClamped });
        }
        silentStart = null;
      }
    }
    return ranges;
  } finally {
    await context.close();
  }
}
