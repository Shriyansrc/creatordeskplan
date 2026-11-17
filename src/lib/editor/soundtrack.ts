import { captionCues } from "./captions";
import { clipDuration, clipStart, projectDuration } from "./project";
import { synthesizers } from "./sfx";
import type { ClipAsset, EditorProject, SfxEvent, TranscriptWord } from "./types";

const musicFiles = new Map<string, File>();
export function rememberMusic(file: File) {
  const id = crypto.randomUUID();
  musicFiles.set(id, file);
  return id;
}
export function hasMusic(id?: string) { return Boolean(id && musicFiles.has(id)); }

export function planSfx(project: EditorProject, transcript: TranscriptWord[]) {
  const cues = captionCues(project, transcript);
  const events: SfxEvent[] = [];
  const skipped: string[] = [];
  const safe = (time: number, duration: number) => time >= 0 && !cues.some((cue) => time < cue.spokenEnd && time + duration > cue.start);
  const add = (kind: SfxEvent["kind"], time: number, duration: number, reason: string, exception = false) => {
    if (exception || safe(time, duration)) events.push({ id: `sfx-${kind}-${events.length}`, kind, time, duration, reason });
    else skipped.push(`${kind} skipped at ${time.toFixed(2)}s because it overlaps speech.`);
  };
  add("whoosh", 0, 0.28, "Opening push-in");
  const first = cues[0];
  if (first) add("impact", first.start, 0.16, "Hook word, strongest hit", true);
  if (project.keywordHighlights) for (const cue of cues.filter((item) => item.keyword)) add("pop", cue.start, 0.09, `Keyword: ${cue.text}`, true);
  // Identify a real CTA rather than pretending the last phrase is always one.
  let finalSentenceStart = 0;
  for (let index = 0; index < cues.length - 1; index++) if (/[.!?]["'”’]*\s*$/.test(cues[index]?.word.word ?? "")) finalSentenceStart = index + 1;
  const cta = cues.slice(finalSentenceStart).find((cue) => /^(subscribe|follow|comment|save|share|click|join|download|try|visit|watch|learn|get|tap|book)$/i.test(cue.text));
  if (cta) {
    const phraseStart = cues.find((cue) => cue.phrase === cta.phrase)?.start ?? cta.start;
    const previousEnd = Math.max(0, ...cues.filter((cue) => cue.start < phraseStart).map((cue) => cue.spokenEnd));
    const duration = Math.min(1, phraseStart - previousEnd);
    if (duration >= 0.12) add("riser", phraseStart - duration, duration, "Into final call to action");
    else skipped.push("CTA riser skipped: no speech-free lead-in. Add a pause before the final call to action.");
  } else skipped.push("CTA riser skipped: no final call to action identified in the transcript.");
  return { events: events.sort((a, b) => a.time - b.time), skipped };
}

export type Soundtrack = { mix: AudioBuffer; voice: AudioBuffer; sfx: AudioBuffer; music: AudioBuffer; voicePeak: number; sfxPeak: number; eventPeaks: { kind: string; time: number; peak: number }[]; musicName: string };
export async function prepareSoundtrack(context: BaseAudioContext, project: EditorProject, assets: ClipAsset[], transcript: TranscriptWord[]): Promise<Soundtrack> {
  const rate = context.sampleRate;
  const length = Math.max(1, Math.ceil(projectDuration(project) * rate));
  const make = () => context.createBuffer(2, length, rate);
  const voice = make(); const sfx = make(); const music = make(); const mix = make();
  const decoded = new Map<string, AudioBuffer>();
  for (const clip of project.clips) {
    const asset = assets.find((item) => item.sourceId === clip.sourceId);
    if (!asset || clip.muted) continue;
    let input = decoded.get(clip.sourceId);
    if (!input) {
      try { input = await context.decodeAudioData(await asset.file.arrayBuffer()); decoded.set(clip.sourceId, input); }
      catch { continue; } // Video-only footage has no voice track.
    }
    const offset = Math.round(clipStart(project, clip.id) * rate);
    const count = Math.round(clipDuration(clip) * rate);
    for (let c = 0; c < 2; c++) {
      const out = voice.getChannelData(c);
      const source = input.getChannelData(Math.min(c, input.numberOfChannels - 1));
      for (let i = 0; i < count && offset + i < length; i++) {
        const position = (clip.trimIn + i / rate * clip.speed) * input.sampleRate;
        const index = Math.floor(position); const fraction = position - index;
        out[offset + i] = ((source[index] ?? 0) * (1 - fraction) + (source[index + 1] ?? 0) * fraction) * clip.volume;
      }
    }
  }
  const peakOf = (buffer: AudioBuffer) => {
    let peak = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) for (const sample of buffer.getChannelData(c)) peak = Math.max(peak, Math.abs(sample));
    return peak;
  };
  const voicePeak = peakOf(voice);
  const eventPeaks: Soundtrack["eventPeaks"] = [];
  if (project.sfxEnabled) for (const event of project.sfx ?? []) {
    const sound = synthesizers[event.kind](context, event.duration);
    const level = voicePeak * (event.kind === "impact" ? 0.35 : event.kind === "pop" ? 0.18 : 0.22);
    const offset = Math.round(event.time * rate);
    const data = sound.getChannelData(0);
    for (let c = 0; c < 2; c++) {
      const out = sfx.getChannelData(c);
      for (let i = 0; i < data.length && offset + i < length; i++) if (offset + i >= 0) out[offset + i] = (out[offset + i] ?? 0) + (data[i] ?? 0) * level;
    }
    eventPeaks.push({ kind: event.kind, time: event.time, peak: level });
  }
  // Cap the combined bus, including coincident keyword pop and hook impact.
  const rawSfxPeak = peakOf(sfx);
  const cap = voicePeak * 0.35;
  if (rawSfxPeak > cap && rawSfxPeak > 0) for (let c = 0; c < 2; c++) {
    const data = sfx.getChannelData(c);
    for (let i = 0; i < data.length; i++) data[i] = (data[i] ?? 0) * cap / rawSfxPeak;
  }
  if (rawSfxPeak > cap && rawSfxPeak > 0) for (const event of eventPeaks) event.peak *= cap / rawSfxPeak;
  let musicName = "Off";
  if (project.music?.enabled) {
    const settings = project.music;
    let input: AudioBuffer | undefined;
    if (settings.kind === "file") {
      const file = settings.assetId ? musicFiles.get(settings.assetId) : undefined;
      if (!file) throw new Error("Choose the background music file again. Files stay in this session only.");
      input = await context.decodeAudioData(await file.arrayBuffer());
    }
    musicName = settings.kind === "pad" ? "Synthesised soft pad" : settings.name;
    const inputPeak = input ? peakOf(input) : 1;
    const cues = captionCues(project, transcript);
    for (let c = 0; c < 2; c++) {
      const out = music.getChannelData(c);
      const source = input?.getChannelData(Math.min(c, input.numberOfChannels - 1));
      let cueIndex = 0;
      for (let i = 0; i < length; i++) {
        const time = i / rate;
        while (cues[cueIndex] && (cues[cueIndex]?.spokenEnd ?? 0) < time - 0.08) cueIndex++;
        const cue = cues[cueIndex];
        const duck = cue && time >= cue.start - 0.04 && time < cue.spokenEnd + 0.08 ? 0.3 : 1;
        const fade = Math.min(1, time / 0.25, (length / rate - time) / 0.25);
        const sample = source ? (source[Math.floor(time * (input?.sampleRate ?? rate)) % source.length] ?? 0) / Math.max(0.001, inputPeak) :
          (Math.sin(time * 2 * Math.PI * 130.81) + Math.sin(time * 2 * Math.PI * 164.81) + Math.sin(time * 2 * Math.PI * 196)) / 3 * (0.8 + 0.2 * Math.sin(time * 0.7));
        out[i] = sample * voicePeak * settings.level * duck * Math.max(0, fade);
      }
    }
  }
  for (let c = 0; c < 2; c++) {
    const out = mix.getChannelData(c); const v = voice.getChannelData(c); const s = sfx.getChannelData(c); const m = music.getChannelData(c);
    for (let i = 0; i < length; i++) out[i] = (v[i] ?? 0) + (s[i] ?? 0) + (m[i] ?? 0);
  }
  const mixPeak = peakOf(mix);
  const headroom = mixPeak > 0.7 ? 0.7 / mixPeak : 1;
  if (headroom < 1) for (const buffer of [mix, voice, sfx, music]) for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) data[i] = (data[i] ?? 0) * headroom;
  }
  for (const event of eventPeaks) event.peak *= headroom;
  return { mix, voice, sfx, music, voicePeak: peakOf(voice), sfxPeak: peakOf(sfx), eventPeaks, musicName };
}