import { drawKaraoke } from "./karaoke";
import { captionFontString, loadCaptionFonts, paintCaptionText } from "./caption-font";
import { drawImpact } from "./impact";
import { applyFrameColor } from "./color";
import { drawMotion, motionError } from "./motion-scenes";
import { renderOffline } from "./offline-export";
import { needsSubjectMasks, subjectBeatError, subjectModeAt } from "./subject-beats";
import { drawSubject, subjectMasksReady } from "./subject-mask";
import { drawWrapping, DEFAULT_WRAPPING } from "./wrapping";
import { activeWord, wordTimelineTime } from "./project";
import type { ClipAsset, EditorClip, EditorProject, TranscriptWord } from "./types";

import { captionScale, timelineZoom } from "./talking-head";
import { captionAt, captionCues } from "./captions";

export const DIMENSIONS = { "9:16": [720, 1280], "1:1": [900, 900], "4:5": [864, 1080], "16:9": [1280, 720] } as const;
const SHADOW_WEIGHTS = Float32Array.from({ length: 256 }, (_, luma) => Math.max(0, 1 - luma / (255 * 0.45)) ** 2);
const shadowMasks = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

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
    context.drawImage(video, x, y, width, height);
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

  const subjectMode = subjectModeAt(project, timelineTime);
  if(subjectMode !== 'original' && video.videoWidth > 0) {
    if(!drawSubject(context,canvas,clip.sourceId,sourceTime,x,y,width,height,subjectMode)){
      context.fillStyle='#111722';context.fillRect(0,0,canvas.width,canvas.height);context.font='600 28px sans-serif';context.textAlign='center';context.fillStyle='#ffffff';context.fillText('Prepare subject masks to preview this look',canvas.width/2,canvas.height/2,canvas.width*.9);context.restore();return;
    }
  }
  applyFrameColor(context, canvas, clip.color);
  const overlay = project.overlays.find((item) => timelineTime >= item.start && timelineTime <= item.end);
  // Retired lens state in older saved projects is intentionally ignored in preview and export.
  if (overlay) {
    context.font = "600 42px CDBody, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#F4F1EA";
    context.fillText(overlay.text, canvas.width / 2, canvas.height * 0.2, canvas.width * 0.9);
  }
  if (project.captionsEnabled && project.wrappingCaptions?.enabled) drawWrapping(context, canvas, project, transcript, timelineTime, { ...DEFAULT_WRAPPING, ...project.wrappingCaptions });
  if (project.captionsEnabled && project.captionStyle.karaoke && !project.wrappingCaptions?.enabled) drawKaraoke(context, canvas, project, transcript, timelineTime);
  if (project.captionsEnabled && !project.captionStyle.karaoke && !project.wrappingCaptions?.enabled && project.captionStyle.preset === "impact") {
    drawImpact(context, canvas, project, transcript, timelineTime);
  }
  if (project.captionsEnabled && !project.captionStyle.karaoke && !project.wrappingCaptions?.enabled && project.captionStyle.preset !== "impact") {
    const ownerStyle = project.captionStyle.preset === "owner";
    const cue = ownerStyle ? captionAt(captionCues(project, transcript), timelineTime) : undefined;
    const word = ownerStyle ? cue?.word : activeWord(project, transcript, clip, sourceTime);
    if (word) {
      const style = project.captionStyle;
      const s = canvas.width / 720;
      const size = style.size * s;
      context.font = captionFontString(style, "caption", size);
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = ownerStyle && project.keywordHighlights && cue?.keyword ? "#FBED4F" : style.color;
      const styled = context as CanvasRenderingContext2D & { letterSpacing?: string };
      styled.letterSpacing = ownerStyle ? `${-0.05 * size}px` : "0px";
      context.save();
      const start = cue?.start ?? wordTimelineTime(project, word) ?? timelineTime;
      const pop = (style.animation ?? (ownerStyle ? "pop" : "none")) === "pop" ? captionScale(timelineTime - start) : 1;
      context.translate(canvas.width / 2, canvas.height * (style.position / 100));
      context.scale(pop, pop);
      paintCaptionText(context, cue?.text ?? word.word, 0, 0, style, s, "caption", canvas.width * 0.92);
      context.restore();
      styled.letterSpacing = "0px";
    }
  }
  drawMotion(context, canvas, video, project, timelineTime);
  context.restore();
}

export async function loadCaptionFont() {
  await loadCaptionFonts();
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
  const sceneError = motionError(project);
  if (sceneError) throw new Error(sceneError);
  const beatError = subjectBeatError(project);
  if (beatError) throw new Error(beatError);
  if(needsSubjectMasks(project) && !subjectMasksReady(project))throw new Error('Prepare subject masks for the full edit before exporting, or choose Original footage.');
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = DIMENSIONS[project.ratio];
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable.");
  await loadCaptionFont();
  const webm = await renderOffline(project, assets, transcript, canvas,
    (video, clip, time) => drawFrame(context, canvas, video, project, clip, transcript, time),
    (value, label) => onProgress(value * (format === "mp4" ? 0.8 : 1), label));
  const blob = format === "mp4" ? await convertToMp4(webm, onProgress) : webm;
  onProgress(1, "Export ready");
  return blob;
      }
