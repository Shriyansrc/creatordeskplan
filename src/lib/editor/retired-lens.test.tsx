import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StyleControls } from './style-controls';
import { createProject, clipFromAsset } from './project';
import { drawFrame } from './export';
import { DEFAULT_FISHEYE } from './fisheye';
import type { ClipAsset } from './types';

const drawLens = vi.hoisted(() => vi.fn());
vi.mock('./fisheye', async (load) => ({ ...await load<typeof import('./fisheye')>(), drawFisheye: drawLens }));

describe('retired editor lens', () => {
  it('removes the panel while preserving caption, SFX and music controls', () => {
    const html = renderToStaticMarkup(<StyleControls project={{ ...createProject(), fisheye: { ...DEFAULT_FISHEYE, enabled: true } }} transcript={[]} change={() => {}} />);
    expect(html).not.toMatch(/fisheye|curvature|lens shine|zoom compensation/i);
    for (const text of ['Keyword highlight', 'Sound effects', 'Wrapping captions', 'Background music']) expect(html).toContain(text);
  });
  it('ignores old saved enabled lens settings in the shared preview/export renderer', () => {
    const project = { ...createProject(), captionsEnabled: false, fisheye: { ...DEFAULT_FISHEYE, enabled: true } };
    const asset = { sourceId: 'asset', name: 'old clip', duration: 4 } as ClipAsset;
    const clip = clipFromAsset(asset);
    const context = { save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    drawLens.mockClear();
    drawFrame(context, { width: 720, height: 1280 } as HTMLCanvasElement, { currentTime: 2, videoWidth: 720, videoHeight: 1280 } as HTMLVideoElement, project, clip, [], 2);
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(drawLens).not.toHaveBeenCalled();
    expect(project.fisheye.enabled).toBe(true); // no destructive project migration
  });
});
