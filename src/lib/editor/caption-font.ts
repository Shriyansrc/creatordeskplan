import type { CaptionFont, CaptionStyle } from "./types";

export const CAPTION_FONT_OPTIONS: { id: CaptionFont; label: string; description: string; family: string; cssFont: string }[] = [
  { id: "anton", label: "Impact", description: "Heavy condensed caps", family: "CDImpact", cssFont: "400 16px CDImpact, sans-serif" },
  { id: "poppins", label: "Font", description: "Your saved italic style", family: "CDCaption", cssFont: "italic 800 16px CDCaption, sans-serif" },
  { id: "script", label: "Script", description: "Flowing handwritten", family: "CDScript", cssFont: "700 16px CDScript, sans-serif" },
  { id: "body", label: "Clean", description: "Simple sans, real weight control", family: "CDBody", cssFont: "600 16px CDBody, sans-serif" },
];

function familyOf(id: CaptionFont): string {
  return CAPTION_FONT_OPTIONS.find((option) => option.id === id)?.family ?? "CDCaption";
}

export function captionDefaultFont(preset: CaptionStyle["preset"]): CaptionFont {
  if (preset === "owner") return "poppins";
  if (preset === "impact") return "script";
  return "body";
}

/** Canvas font string for one of the real registered caption faces. */
export function captionFontString(style: CaptionStyle, role: "caption" | "impact", size: number): string {
  const family = role === "impact" ? familyOf(style.impactFont ?? "anton") : familyOf(style.font ?? captionDefaultFont(style.preset));
  if (family === "CDCaption") return `italic 800 ${size}px CDCaption, sans-serif`;
  if (family === "CDScript") return `700 ${size}px CDScript, sans-serif`;
  if (family === "CDBody") return `${Math.min(900, Math.max(100, Math.round(style.weight ?? 600)))} ${size}px CDBody, sans-serif`;
  return `400 ${size}px CDImpact, sans-serif`;
}

type CaptionEffects = { outline: number; outlineColor: string; shadowBlur: number; shadowAlpha: number; shadowOffsetY: number };

export function captionEffects(style: CaptionStyle, scale: number, role: "caption" | "impact"): CaptionEffects {
  const outline = Math.max(0, Math.min(6, style.outline ?? 0)) * scale;
  const strength = Math.max(0, Math.min(10, style.shadow ?? (role === "caption" ? 4 : 0)));
  return {
    outline,
    outlineColor: style.outlineColor ?? "#111722",
    shadowBlur: strength * scale,
    shadowAlpha: Math.min(0.85, 0.19 * strength),
    shadowOffsetY: strength * 0.5 * scale,
  };
}

/** Draws one caption word with the style's real outline and shadow. Fill style must be set by the caller. */
export function paintCaptionText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  style: CaptionStyle,
  scale: number,
  role: "caption" | "impact",
  maxWidth?: number,
) {
  const fx = captionEffects(style, scale, role);
  if (fx.shadowBlur > 0) {
    context.shadowColor = `rgba(0,0,0,${fx.shadowAlpha})`;
    context.shadowBlur = fx.shadowBlur;
    context.shadowOffsetY = fx.shadowOffsetY;
  }
  if (fx.outline > 0) {
    context.lineWidth = fx.outline * 2;
    context.strokeStyle = fx.outlineColor;
    context.lineJoin = "round";
    if (maxWidth) context.strokeText(text, x, y, maxWidth);
    else context.strokeText(text, x, y);
  }
  if (maxWidth) context.fillText(text, x, y, maxWidth);
  else context.fillText(text, x, y);
}

/** Loads every registered caption face; throws naming the missing one so export never silently falls back. */
export async function loadCaptionFonts() {
  const wanted: [string, string][] = [
    ["italic 800 64px CDCaption", "Font (Poppins italic)"],
    ["400 64px CDImpact", "Impact (Anton)"],
    ["700 64px CDScript", "Script (Dancing Script)"],
    ["600 64px CDBody", "Clean (body)"],
  ];
  const missing: string[] = [];
  await Promise.all(wanted.map(async ([spec, label]) => {
    try {
      const loaded = await document.fonts.load(spec);
      if (!loaded.length) missing.push(label);
    } catch {
      missing.push(label);
    }
  }));
  if (missing.length) throw new Error(`Caption font could not load: ${missing.join(", ")}. Try again before applying or exporting captions.`);
      }
