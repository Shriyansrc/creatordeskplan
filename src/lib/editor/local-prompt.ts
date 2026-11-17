import { editResponseSchema, type EditOperation } from "@/lib/ai/contracts";
import type { EditorProject } from "./types";

function seconds(value: string) {
  const parts = value.split(":").map(Number);
  return parts.length === 2 ? (parts[0] ?? 0) * 60 + (parts[1] ?? 0) : (parts[0] ?? 0);
}

export function parseLocalPrompt(prompt: string, project: EditorProject) {
  const text = prompt.trim().toLowerCase();
  const operations: EditOperation[] = [];
  const selected = project.clips[0];
  const clipId = selected?.id;
  if (!selected && !/caption|crop|text/.test(text)) throw new Error("Add a clip before asking for this edit.");

  if (/cut|remove|strip/.test(text) && /silence|silent|pauses|gaps/.test(text)) {
    operations.push({ type: "removeSilence", threshold: 0.025, minDuration: 0.35, ranges: [] });
  }
  if (/add|enable|turn on|burn/.test(text) && /caption|subtitle/.test(text)) operations.push({ type: "captions", enabled: true, style: "impact" });
  if (/remove|disable|turn off/.test(text) && /caption|subtitle/.test(text)) operations.push({ type: "captions", enabled: false });

  const ratio = text.match(/(9\s*:\s*16|1\s*:\s*1|4\s*:\s*5|16\s*:\s*9)/)?.[1]?.replace(/\s/g, "") as "9:16" | "1:1" | "4:5" | "16:9" | undefined;
  if (ratio) operations.push({ type: "crop", ratio });
  else if (/vertical|portrait|reel|short/.test(text) && /crop|reframe|vertical|portrait/.test(text)) operations.push({ type: "crop", ratio: "9:16" });
  else if (/square/.test(text)) operations.push({ type: "crop", ratio: "1:1" });

  const base = selected?.color ?? { brightness: 100, contrast: 100, saturation: 100, temperature: 0 };
  if (/brighter|brighten|more bright/.test(text)) operations.push({ type: "color", brightness: Math.min(200, base.brightness + 15) });
  if (/darker|darken|less bright/.test(text)) operations.push({ type: "color", brightness: Math.max(0, base.brightness - 15) });
  if (/more contrast|increase contrast|punchy/.test(text)) operations.push({ type: "color", contrast: Math.min(200, base.contrast + 20) });
  if (/less contrast|reduce contrast/.test(text)) operations.push({ type: "color", contrast: Math.max(0, base.contrast - 20) });
  if (/more saturation|more colorful|more colourful|vibrant/.test(text)) operations.push({ type: "color", saturation: Math.min(200, base.saturation + 20) });
  if (/warm/.test(text)) operations.push({ type: "color", temperature: Math.min(100, base.temperature + 20) });
  if (/cool/.test(text)) operations.push({ type: "color", temperature: Math.max(-100, base.temperature - 20) });

  const speedMatch = text.match(/(?:speed(?: up)?(?: to| by)?|make it)\s*(\d(?:\.\d+)?)\s*x/);
  if (speedMatch) operations.push({ type: "speed", value: Math.max(0.25, Math.min(4, Number(speedMatch[1]))) });
  else if (/speed up|faster/.test(text)) operations.push({ type: "speed", value: Math.min(4, (selected?.speed ?? 1) * 1.25) });
  else if (/slow down|slower/.test(text)) operations.push({ type: "speed", value: Math.max(0.25, (selected?.speed ?? 1) * 0.8) });
  if (/mute|no audio|remove audio/.test(text)) operations.push({ type: "volume", value: 0, muted: true });
  if (/unmute/.test(text)) operations.push({ type: "volume", value: selected?.volume ?? 1, muted: false });

  const removal = text.match(/(?:remove|delete|cut)(?: the)?(?: section| part)?(?: from)?\s*(\d+(?::\d+)?(?:\.\d+)?)\s*(?:s|sec|seconds)?\s*(?:to|-)\s*(\d+(?::\d+)?(?:\.\d+)?)/);
  if (removal && clipId) {
    const start = seconds(removal[1] ?? "");
    const end = seconds(removal[2] ?? "");
    if (end > start) operations.push({ type: "delete", clipId, start, end });
  }
  const trim = text.match(/trim(?: clip)?(?: from)?\s*(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)/);
  if (trim && clipId) operations.push({ type: "trim", clipId, start: Number(trim[1]), end: Number(trim[2]) });
  if (/split/.test(text) && clipId) {
    const at = Number(text.match(/split(?: at)?\s*(\d+(?:\.\d+)?)/)?.[1] ?? (selected.trimIn + selected.trimOut) / 2);
    operations.push({ type: "split", clipId, at });
  }
  if (/punch|zoom in/.test(text) && clipId) operations.push({ type: "zoom", clipId, start: selected.trimIn, end: Math.min(selected.trimOut, selected.trimIn + 1), scale: 1.2 });
  const overlay = prompt.match(/(?:text|overlay|say)\s*["“']([^"”']+)["”']/i);
  if (overlay?.[1]) operations.push({ type: "textOverlay", text: overlay[1].slice(0, 200), start: 0, end: Math.min(3, selected ? selected.trimOut : 3) });

  if (!operations.length) throw new Error("Basic mode did not recognize that edit. Try cut silences, add captions, crop to 9:16, brighter, darker, more contrast, speed up, mute, split at 2, or remove 1 to 3.");
  return editResponseSchema.parse({ summary: "Basic command preview. Review every change before accepting it.", operations });
    }
