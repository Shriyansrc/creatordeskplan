import type { ClipAsset, EditorProject } from "./types";
export type SubjectMode = "original" | "sticker" | "silhouette";
type MaskFrame = { time: number; canvas: HTMLCanvasElement };
const frames = new Map<string, MaskFrame[]>();
const FPS = 8;
export function maskAt(sourceId: string, time: number) {
  const list = frames.get(sourceId);
  if (!list?.length) return null;
  const found = list.reduce((a, b) =>
    Math.abs(a.time - time) < Math.abs(b.time - time) ? a : b,
  );
  return Math.abs(found.time - time) <= 1 / FPS + 0.02 ? found.canvas : null;
}
export function clearSubjectMasks() {
  frames.clear();
}
export function subjectMasksReady(project: EditorProject) {
  return project.clips.length > 0 && project.clips.every((clip) => {
    for (let t = clip.trimIn; t < clip.trimOut - 0.001; t += 1 / FPS) {
      if (!maskAt(clip.sourceId, t)) return false;
    }
    return true;
  });
}
function event(video: HTMLVideoElement, name: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => done(Error("Video processing timed out.")),
      10000,
    );
    const abort = () => done(Error("Canceled."));
    const fail = () => done(Error("Video frame could not be read."));
    const ok = () => done();
    function done(error?: Error) {
      clearTimeout(timer);
      video.removeEventListener(name, ok);
      video.removeEventListener("error", fail);
      signal.removeEventListener("abort", abort);
      error ? reject(error) : resolve();
    }
    video.addEventListener(name, ok, { once: true });
    video.addEventListener("error", fail, { once: true });
    signal.addEventListener("abort", abort, { once: true });
  });
}
export async function prepareSubjectMasks(
  project: EditorProject,
  assets: ClipAsset[],
  signal: AbortSignal,
  progress: (done: number, total: number) => void,
) {
  if (signal.aborted) throw Error("Canceled.");
  const duration = project.clips.reduce((n, c) => n + c.trimOut - c.trimIn, 0);
  if (duration > 30)
    throw Error(
      "Subject masking currently supports up to 30 seconds of selected source footage. Use a shorter clip.",
    );
  if (!project.clips.length) throw Error("Import a video first.");
  const worker = new Worker("/creator-vision/worker.js");
  let id = 0;
  const call = (body: object, transfer: Transferable[] = []) =>
    new Promise<any>((resolve, reject) => {
      if (signal.aborted) {
        reject(Error("Canceled."));
        return;
      }
      const requestId = ++id;
      const timer = setTimeout(
        () =>
          finish(
            Error(
              "Local person-mask model did not respond. Nothing was uploaded.",
            ),
          ),
        45000,
      );
      const abort = () => finish(Error("Canceled."));
      const error = () =>
        finish(Error("Local person-mask worker could not load."));
      const receive = (e: MessageEvent) => {
        if (e.data.id === requestId)
          finish(e.data.error ? Error(e.data.error) : undefined, e.data);
      };
      function finish(cause?: Error, data?: any) {
        clearTimeout(timer);
        worker.removeEventListener("message", receive);
        worker.removeEventListener("error", error);
        signal.removeEventListener("abort", abort);
        cause ? reject(cause) : resolve(data);
      }
      worker.addEventListener("message", receive);
      worker.addEventListener("error", error);
      signal.addEventListener("abort", abort, { once: true });
      worker.postMessage({ ...body, id: requestId }, transfer);
    });
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  const prepared = new Map<string, MaskFrame[]>();
  let done = 0;
  const total = Math.ceil(duration * FPS) + project.clips.length;
  try {
    await call({ type: "init" });
    for (const clip of project.clips) {
      if (signal.aborted) throw Error("Canceled.");
      const asset = assets.find((a) => a.sourceId === clip.sourceId);
      if (!asset || !asset.width)
        throw Error("Original video is not available for masking.");
      video.src = asset.url;
      if (video.readyState < 2) await event(video, "loadeddata", signal);
      const list = prepared.get(clip.sourceId) ?? [];
      for (
        let time = clip.trimIn;
        time < clip.trimOut + 0.001;
        time += 1 / FPS
      ) {
        if (signal.aborted) throw Error("Canceled.");
        const target = Math.min(
          time,
          clip.trimOut - 0.001,
          video.duration - 0.001,
        );
        if (Math.abs(video.currentTime - target) > 0.002) {
          const seeked = event(video, "seeked", signal);
          video.currentTime = target;
          await seeked;
        }
        const bitmap = await createImageBitmap(video, {
          resizeWidth: 192,
          resizeHeight: Math.max(
            1,
            Math.round((192 * asset.height) / asset.width),
          ),
        });
        const result = await call({ bitmap }, [bitmap]);
        const canvas = document.createElement("canvas");
        canvas.width = result.width;
        canvas.height = result.height;
        const context = canvas.getContext("2d");
        if (!context) throw Error("Mask canvas unavailable.");
        const rgba = context.createImageData(canvas.width, canvas.height);
        for (let i = 0; i < result.alpha.length; i++) {
          rgba.data[i * 4] = 255;
          rgba.data[i * 4 + 1] = 255;
          rgba.data[i * 4 + 2] = 255;
          rgba.data[i * 4 + 3] = result.alpha[i];
        }
        context.putImageData(rgba, 0, 0);
        list.push({ time: target, canvas });
        progress(++done, total);
      }
      prepared.set(clip.sourceId, list);
    }
    for (const [key, list] of prepared) frames.set(key, list);
  } finally {
    video.removeAttribute("src");
    video.load();
    worker.terminate();
  }
}
const layers = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
// Build the white border on the small model mask, never by stamping a full
// 720x1280 video layer sixteen times per rendered frame.
const outlines = new WeakMap<HTMLCanvasElement, { key: string; canvas: HTMLCanvasElement }>();
function subjectOutline(mask: HTMLCanvasElement, radiusX: number, radiusY: number) {
  const key = `${radiusX.toFixed(2)}:${radiusY.toFixed(2)}`;
  const cached = outlines.get(mask);
  if (cached?.key === key) return cached.canvas;
  const outline = document.createElement("canvas");
  outline.width = mask.width;
  outline.height = mask.height;
  const context = outline.getContext("2d");
  if (!context) return null;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
    context.drawImage(mask, Math.cos(a) * radiusX, Math.sin(a) * radiusY);
  }
  context.globalCompositeOperation = "source-in";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outline.width, outline.height);
  outlines.set(mask, { key, canvas: outline });
  return outline;
}
export function drawSubject(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  sourceId: string,
  time: number,
  x: number,
  y: number,
  width: number,
  height: number,
  mode: SubjectMode,
) {
  if (mode === "original") return true;
  const mask = maskAt(sourceId, time);
  if (!mask) return false;
  let layer = layers.get(canvas);
  if (!layer) {
    layer = document.createElement("canvas");
    layers.set(canvas, layer);
  }
  layer.width = canvas.width;
  layer.height = canvas.height;
  const l = layer.getContext("2d");
  if (!l) return false;
  l.clearRect(0, 0, layer.width, layer.height);
  l.drawImage(canvas, 0, 0);
  l.globalCompositeOperation = "destination-in";
  l.drawImage(mask, x, y, width, height);
  l.globalCompositeOperation = "source-over";
  context.fillStyle = "#182137";
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (mode === "silhouette") {
    l.globalCompositeOperation = "source-in";
    l.fillStyle = "#FBED4F";
    l.fillRect(0, 0, layer.width, layer.height);
    l.globalCompositeOperation = "source-over";
  } else {
    const radius = Math.max(3, canvas.width * 0.01);
    const outline = subjectOutline(mask, radius * mask.width / width, radius * mask.height / height);
    if (!outline) return false;
    context.drawImage(outline, x, y, width, height);
  }
  context.drawImage(layer, 0, 0);
  return true;
  }
