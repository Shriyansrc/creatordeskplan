import { drawWrapping, DEFAULT_WRAPPING } from "./wrapping";
import { withWebmDuration } from "./webm-duration";
import { activeWord, clipDuration, clipStart, projectDuration, wordTimelineTime } from "./project";
import type { ClipAsset, EditorClip, EditorProject, TranscriptWord } from "./types";

import { captionScale, timelineZoom } from "./talking-head";
import { captionAt, captionCues } from "./captions";
import { drawFisheye } from "./fisheye";
import { prepareSoundtrack } from "./soundtrack";

export const DIMENSIONS = { "9:16": [720, 1280], "1:1": [900, 900], "4:5": [864, 1080], "16:9": [1280, 720] } as const;
const SHADOW_WEIGHTS = Float32Array.from({ length: 256 }, (_, luma) => Math.max(0, 1 - luma / (255 * 0.45)) ** 2);
const shadowMasks = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

function waitFor(event: string, video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("The clip could not be prepared for export.")); };
    const cleanup = () => { video.removeEventListener(event, done); video.removeEventListener("error", fail); };
    video.addEventListener(event, done, { once: true });
    video.addEventListener("error", fail, { once: true });
  });
}

function filterFor(clip: EditorClip) {
  const warmth = clip.color.temperature;
  return `brightness(${clip.color.brightness}%) contrast(${clip.color.contrast}%) saturate(${clip.color.saturation}%) sepia(${Math.abs(warmth)}%) hue-rotate(${warmth < 0 ? 180 : 0}deg)`;
}

export function drawFrame(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  project: EditorProject,
  clip: EditorClip,
  transcript: TranscriptWord[],
  timelineTime: number,
) {
  const sourceTime = video.currentTime;
  context.save();
  context.fillStyle = "#111722";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const punch = clip.zooms.find((zoom) => sourceTime >= zoom.start && sourceTime <= zoom.end)?.scale ?? 1;
  const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight) * clip.crop.zoom * punch * timelineZoom(project, timelineTime);
  const width = video.videoWidth * scale;
  const height = video.videoHeight * scale;
  const x = (canvas.width - width) / 2 + (clip.crop.x / 100) * canvas.width;
  const y = (canvas.height - height) / 2 + (clip.crop.y / 100) * canvas.height;
  // Audio-only clips (for example an AI voice track) have no frame: keep the background.
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    context.filter = filterFor(clip);
    context.drawImage(video, x, y, width, height);
    context.filter = "none";
  }

  if (clip.color.navyShadows && video.videoWidth > 0) {
    let mask = shadowMasks.get(canvas);
    if (!mask) {
      mask = document.createElement("canvas");
      mask.width = 180;
      mask.height = Math.round(180 * canvas.height / canvas.width);
      shadowMasks.set(canvas, mask);
    }
    const maskContext = mask.getContext("2d", { willReadFrequently: true });
    if (maskContext) {
    maskContext.clearRect(0, 0, mask.width, mask.height);
    maskContext.drawImage(canvas, 0, 0, mask.width, mask.height);
    const image = maskContext.getImageData(0, 0, mask.width, mask.height);
    for (let i = 0; i < image.data.length; i += 4) {
      const r = image.data[i] ?? 0;
      const g = image.data[i + 1] ?? 0;
      const b = image.data[i + 2] ?? 0;
      const luma = (54 * r + 183 * g + 19 * b) >> 8;
      const amount = clip.color.navyShadows * (SHADOW_WEIGHTS[luma] ?? 0);
      image.data[i] = 16;
      image.data[i + 1] = 36;
      image.data[i + 2] = 68;
      image.data[i + 3] = Math.round(amount * 255);
    }
    maskContext.putImageData(image, 0, 0);
    context.drawImage(mask, 0, 0, canvas.width, canvas.height);
    }
  }
  if (clip.color.vignette) {
    const radius = Math.hypot(canvas.width, canvas.height) / 2;
    const gradient = context.createRadialGradient(canvas.width / 2, canvas.height / 2, radius * 0.2, canvas.width / 2, canvas.height / 2, radius);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${clip.color.vignette})`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const overlay = project.overlays.find((item) => timelineTime >= item.start && timelineTime <= item.end);
  if (project.fisheye?.enabled) drawFisheye(context, canvas, project.fisheye, timelineTime);
  if (overlay) {
    context.font = "600 42px CDBody, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#F4F1EA";
    context.fillText(overlay.text, canvas.width / 2, canvas.height * 0.2, canvas.width * 0.9);
  }
  if (project.captionsEnabled && project.wrappingCaptions?.enabled) drawWrapping(context, canvas, project, transcript, timelineTime, { ...DEFAULT_WRAPPING, ...project.wrappingCaptions });
  if (project.captionsEnabled && !project.wrappingCaptions?.enabled) {
    const ownerStyle = project.captionStyle.preset === "owner";
    const cue = ownerStyle ? captionAt(captionCues(project, transcript), timelineTime) : undefined;
    const word = ownerStyle ? cue?.word : activeWord(project, transcript, clip, sourceTime);
    if (word) {
      const owner = project.captionStyle.preset === "owner";
      const size = project.captionStyle.size * (canvas.width / 720);
      context.font = owner ? `italic 800 ${size}px CDCaption, sans-serif` : `600 ${size}px CDBody, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = owner && project.keywordHighlights && cue?.keyword ? "#FBED4F" : project.captionStyle.color;
      const styled = context as CanvasRenderingContext2D & { letterSpacing?: string };
      styled.letterSpacing = owner ? `${-0.05 * size}px` : "0px";
      context.save();
      const start = cue?.start ?? wordTimelineTime(project, word) ?? timelineTime;
      const pop = owner ? captionScale(timelineTime - start) : 1;
      context.translate(canvas.width / 2, canvas.height * (project.captionStyle.position / 100));
      context.scale(pop, pop);
      if (owner) {
        context.shadowColor = "rgba(0,0,0,0.5)";
        context.shadowBlur = 4;
        context.shadowOffsetY = 2;
      }
      context.fillText(cue?.text ?? word.word, 0, 0, canvas.width * 0.92);
      context.restore();
      styled.letterSpacing = "0px";
    }
  }
  context.restore();
}

export async function loadCaptionFont() {
  const fonts = await document.fonts.load('italic 800 64px CDCaption');
  if (!fonts.length) throw new Error("The Font caption font could not load. Try again before applying or exporting captions.");
}

async function renderWebM(
  project: EditorProject,
  assets: ClipAsset[],
  transcript: TranscriptWord[],
  onProgress: (value: number, label: string) => void,
): Promise<Blob> {
  if (!project.clips.length) throw new Error("Add at least one clip before exporting.");
  if (typeof MediaRecorder === "undefined") throw new Error("This browser does not support local video recording. Try current Chrome, Edge, or Firefox.");
  const missing = project.clips.find((clip) => !assets.some((asset) => asset.sourceId === clip.sourceId));
  if (missing) throw new Error(`${missing.name} is no longer available. Choose the original file again on the Clips screen.`);
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = DIMENSIONS[project.ratio];
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable in this browser.");
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const stream = canvas.captureStream(30);
  const audioContext = new AudioContext();
  const audioDestination = audioContext.createMediaStreamDestination();
  const soundtrack = await prepareSoundtrack(audioContext, project, assets, transcript);
  let audioSource: AudioBufferSourceNode | undefined;
  for (const track of audioDestination.stream.getAudioTracks()) stream.addTrack(track);
  const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error("WebM recording is not supported by this browser.");
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const stopped = new Promise<void>((resolve, reject) => { recorder.onstop = () => resolve(); recorder.onerror = () => reject(new Error("The browser recorder failed during export.")); });
  const total = projectDuration(project);
  let completed = 0;
  try {
    await audioContext.resume();
    await loadCaptionFont();
    for (const clip of project.clips) {
      const asset = assets.find((item) => item.sourceId === clip.sourceId);
      if (!asset) throw new Error("The original clip is unavailable.");
      onProgress(completed / total, `Rendering ${clip.name}`);
      video.src = asset.url;
      if (video.readyState < 1) await waitFor("loadedmetadata", video);
      if (video.readyState < 2) await waitFor("loadeddata", video);
      video.playbackRate = clip.speed;
      const seekTarget = Math.min(clip.trimIn, Math.max(0, video.duration - 0.01));
      if (Math.abs(video.currentTime - seekTarget) > 0.01) {
        const seeked = waitFor("seeked", video);
        video.currentTime = seekTarget;
        await seeked;
      }
      drawFrame(context, canvas, video, project, clip, transcript, clipStart(project, clip.id));
      if (recorder.state === "inactive") recorder.start(250);
      if (recorder.state === "paused") recorder.resume();
      audioSource = audioContext.createBufferSource();
      audioSource.buffer = soundtrack.mix;
      audioSource.connect(audioDestination);
      audioSource.start(0, clipStart(project, clip.id), clipDuration(clip));
      await video.play();
      await new Promise<void>((resolve) => {
        const draw = () => {
          const timelineTime = clipStart(project, clip.id) + Math.max(0, video.currentTime - clip.trimIn) / clip.speed;
          drawFrame(context, canvas, video, project, clip, transcript, timelineTime);
          onProgress(Math.min(0.99, (completed + Math.max(0, video.currentTime - clip.trimIn) / clip.speed) / total), `Rendering ${clip.name}`);
          if (video.currentTime >= clip.trimOut - 0.015 || video.ended) resolve();
          else requestAnimationFrame(draw);
        };
        requestAnimationFrame(draw);
      });
      video.pause();
      audioSource.stop();
      audioSource.disconnect();
      audioSource = undefined;
      if (recorder.state === "recording") recorder.pause();
      completed += clipDuration(clip);
    }
    recorder.stop();
    await stopped;
    return await withWebmDuration(new Blob(chunks, { type: "video/webm" }), total * 1000);
  } finally {
    video.pause();
    if (recorder.state !== "inactive") recorder.stop();
    for (const track of stream.getTracks()) track.stop();
    audioSource?.stop();
    audioSource?.disconnect();
    await audioContext.close();
  }
}

async function convertToMp4(webm: Blob, onProgress: (value: number, label: string) => void) {
  onProgress(0.82, "Loading the local MP4 converter…");
  const [{ FFmpeg }, { fetchFile }, { default: coreURL }, { default: wasmURL }] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/util"),
    import("@ffmpeg/core?url"),
    import("@ffmpeg/core/wasm?url"),
  ]);
  const ffmpeg = new FFmpeg();
  try {
    ffmpeg.on("progress", ({ progress }) => onProgress(0.82 + Math.max(0, Math.min(1, progress)) * 0.17, "Converting to MP4 on this device…"));
    ffmpeg.on("log", ({ message }) => { if (message) onProgress(0.84, "Converting to MP4 on this device: " + message.slice(0, 70)); });
    await Promise.race([ffmpeg.load({ coreURL, wasmURL }), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("The MP4 converter did not load within 60 seconds. Choose WebM and export again.")), 60000))]);
    await ffmpeg.writeFile("creator-desk-input.webm", await fetchFile(webm));
    const code = await ffmpeg.exec(["-i", "creator-desk-input.webm", "-vf", "fps=30", "-c:v", "libx264", "-preset", "ultrafast", "-threads", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", "creator-desk-output.mp4"], 240000);
    if (code === 1) throw new Error("MP4 conversion took too long on this device. Download WebM instead.");
    if (code !== 0) throw new Error(`MP4 conversion stopped with FFmpeg code ${code}. Download WebM instead.`);
    const data = await ffmpeg.readFile("creator-desk-output.mp4");
    if (typeof data === "string") throw new Error("MP4 conversion returned no video data.");
    return new Blob([new Uint8Array(data)], { type: "video/mp4" });
  } finally {
    ffmpeg.terminate();
  }
}

export async function exportProject(
  project: EditorProject,
  assets: ClipAsset[],
  transcript: TranscriptWord[],
  format: "webm" | "mp4",
  onProgress: (value: number, label: string) => void,
) {
  const webm = await renderWebM(project, assets, transcript, (value, label) => onProgress(value * (format === "mp4" ? 0.8 : 1), label));
  const blob = format === "mp4" ? await convertToMp4(webm, onProgress) : webm;
  onProgress(1, "Export ready");
  return blob;
        }
