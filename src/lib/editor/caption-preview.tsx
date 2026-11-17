import { useEffect, useRef } from "react";
import { captionFontString, paintCaptionText } from "./caption-font";
import { captionCues, captionAt } from "./captions";
import { drawImpact } from "./impact";
import { drawKaraoke } from "./karaoke";
import { createProject } from "./project";
import type { CaptionStyle, EditorClip, TranscriptWord } from "./types";

const PREVIEW_WORDS: TranscriptWord[] = [
  { id: "pv1", clipId: "preview-clip", word: "First", start: 0, end: 0.32 },
  { id: "pv2", clipId: "preview-clip", word: "instinct", start: 0.34, end: 0.72 },
  { id: "pv3", clipId: "preview-clip", word: "wins", start: 0.74, end: 1.05 },
];
const PREVIEW_TIME = 0.5;

function previewClip(): EditorClip {
  return {
    id: "preview-clip",
    originId: "preview-clip",
    sourceId: "preview-source",
    name: "preview",
    trimIn: 0,
    trimOut: 2,
    sourceDuration: 2,
    speed: 1,
    volume: 1,
    muted: true,
    crop: { x: 0, y: 0, zoom: 1 },
    color: { brightness: 100, contrast: 100, saturation: 100, temperature: 0 },
    zooms: [],
  };
}

/** Real rendering of the current caption style on fixed sample words - a style preview, not detected speech. */
export function CaptionPreview({ style }: { style: CaptionStyle }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      const project = { ...createProject(), clips: [previewClip()], captionStyle: style };
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#111722";
      context.fillRect(0, 0, canvas.width, canvas.height);
      try {
        if (style.karaoke) drawKaraoke(context, canvas, project, PREVIEW_WORDS, PREVIEW_TIME);
        else if (style.preset === "impact") drawImpact(context, canvas, project, PREVIEW_WORDS, PREVIEW_TIME);
        else {
          const cue = style.preset === "owner" ? captionAt(captionCues(project, PREVIEW_WORDS), PREVIEW_TIME) : undefined;
          const word = cue?.text ?? "instinct";
          const s = canvas.width / 720;
          const size = style.size * s;
          context.save();
          context.font = captionFontString(style, "caption", size);
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillStyle = style.color;
          paintCaptionText(context, word, canvas.width / 2, (canvas.height * style.position) / 100, style, s, "caption", canvas.width * 0.92);
          context.restore();
        }
      } catch {
        // Fonts still loading: the next style change or open redraws the preview.
      }
    });
    return () => { cancelled = true; };
  }, [style]);
  return (
    <div className="caption-preview">
      <canvas ref={ref} width={300} height={150} aria-label="Caption style preview" />
      <span>Style preview, not your video</span>
    </div>
  );
}
