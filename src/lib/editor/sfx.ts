import type { SfxKind } from "./types";

// Deterministic procedural signals. No recordings, remote media or paid libraries.
function noise(index: number) {
  const value = Math.sin((index + 1) * 12.9898) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}
function synth(context: BaseAudioContext, kind: SfxKind, duration: number) {
  const buffer = context.createBuffer(1, Math.max(1, Math.ceil(duration * context.sampleRate)), context.sampleRate);
  const data = buffer.getChannelData(0);
  let low = 0;
  let phase = 0;
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / context.sampleRate;
    const p = t / duration;
    const n = noise(i);
    const cutoff = kind === "riser" ? 180 + 7000 * p * p : 800 + 5000 * Math.sin(Math.PI * p);
    const alpha = 1 - Math.exp(-2 * Math.PI * cutoff / context.sampleRate);
    low += alpha * (n - low);
    const envelope = Math.sin(Math.PI * Math.min(1, p)) ** 2;
    let value = 0;
    if (kind === "whoosh" || kind === "riser") value = low * envelope;
    else if (kind === "impact") { phase += 2 * Math.PI * (45 + 90 * Math.exp(-t * 30)) / context.sampleRate; value = Math.sin(phase) * Math.exp(-t * 18) * Math.min(1, t * 700); }
    else if (kind === "pop") { phase += 2 * Math.PI * (320 + 600 * Math.exp(-t * 45)) / context.sampleRate; value = Math.sin(phase) * Math.exp(-t * 45) * Math.min(1, t * 1000); }
    else if (kind === "click") value = (n - low) * Math.exp(-t * 180) * Math.min(1, t * 2000);
    else if (kind === "cameraFlash") value = (n - low) * Math.exp(-t * 32) * Math.min(1, t * 1200);
    else value = (Math.sin(2 * Math.PI * 1568 * t) + Math.sin(2 * Math.PI * 2093 * t) * 0.5) * envelope * Math.exp(-t * 6);
    data[i] = value;
    peak = Math.max(peak, Math.abs(value));
  }
  if (peak > 0) for (let i = 0; i < data.length; i++) data[i] = (data[i] ?? 0) / peak;
  return buffer;
}
export const whoosh = (c: BaseAudioContext, d = 0.28) => synth(c, "whoosh", d);
export const pop = (c: BaseAudioContext, d = 0.09) => synth(c, "pop", d);
export const click = (c: BaseAudioContext, d = 0.035) => synth(c, "click", d);
export const riser = (c: BaseAudioContext, d = 1) => synth(c, "riser", d);
export const impact = (c: BaseAudioContext, d = 0.16) => synth(c, "impact", d);
export const cameraFlash = (c: BaseAudioContext, d = 0.12) => synth(c, "cameraFlash", d);
export const magicDust = (c: BaseAudioContext, d = 0.4) => synth(c, "magicDust", d);
export const synthesizers = { whoosh, pop, click, riser, impact, cameraFlash, magicDust };