import type { ColorSettings } from './types';

const clamp = (n: number) => Math.max(0, Math.min(255, n));
/** Deterministic pixel colour in preview and export, including browsers without Canvas filter. */
export function colorPixels(data: Uint8ClampedArray, settings: ColorSettings) {
  const brightness = settings.brightness / 100;
  const contrast = settings.contrast / 100;
  const saturation = settings.saturation / 100;
  const warmth = settings.temperature / 100;
  const red = 1 + warmth * .22;
  const blue = 1 - warmth * .22;
  const lookup = Float32Array.from({ length: 256 }, (_, n) => clamp((n * brightness - 127.5) * contrast + 127.5));
  for (let i = 0; i < data.length; i += 4) {
    const r = lookup[data[i]!]!, g = lookup[data[i + 1]!]!, b = lookup[data[i + 2]!]!;
    const luma = .2126 * r + .7152 * g + .0722 * b;
    data[i] = clamp((luma + (r - luma) * saturation) * red);
    data[i + 1] = clamp(luma + (g - luma) * saturation);
    data[i + 2] = clamp((luma + (b - luma) * saturation) * blue);
  }
}
export function applyFrameColor(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, settings: ColorSettings) {
  if (settings.brightness === 100 && settings.contrast === 100 && settings.saturation === 100 && settings.temperature === 0) return;
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  colorPixels(frame.data, settings);
  context.putImageData(frame, 0, 0);
}
