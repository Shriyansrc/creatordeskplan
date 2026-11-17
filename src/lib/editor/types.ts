import type { EditOperation, Platform, Ratio } from "@/lib/editor/contracts";

export type ClipAsset = {
  sourceId: string;
  file: File;
  url: string;
  name: string;
  duration: number;
  width: number;
  height: number;
};

export type CropSettings = { x: number; y: number; zoom: number };
export type ColorSettings = { brightness: number; contrast: number; saturation: number; temperature: number; navyShadows?: number; vignette?: number };
export type PushIn = { start: number; duration: number; from: number; to: number };
export type ZoomPunch = { id: string; start: number; end: number; scale: number };

export type EditorClip = {
  id: string;
  originId: string;
  sourceId: string;
  name: string;
  trimIn: number;
  trimOut: number;
  sourceDuration: number;
  speed: number;
  volume: number;
  muted: boolean;
  crop: CropSettings;
  color: ColorSettings;
  zooms: ZoomPunch[];
};

export type CaptionFont = "anton" | "poppins" | "script" | "body";
export type CaptionPreset = "impact" | "owner" | "plain";
export type CaptionStyle = {
  karaoke?: boolean;
  preset: CaptionPreset;
  /** Font for the normal caption words. Defaults: script (impact preset), poppins (owner), body (plain). */
  font?: CaptionFont;
  /** Font for the big impact word in the impact preset. Defaults to anton. */
  impactFont?: CaptionFont;
  /** Impact word colour in the impact preset. Defaults to the reference red. */
  impactColor?: string;
  /** Real font weight 100-900; only the variable Clean/body font honours it. */
  weight?: number;
  /** Text stroke width in px at 720px preview width; 0 means no outline. */
  outline?: number;
  outlineColor?: string;
  /** Soft shadow strength 0-10; default 4 for caption words, 0 for the impact word. */
  shadow?: number;
  /** Word-entry animation. "pop" is a light scale-in on the first frames; "none" is a hard cut. */
  animation?: "pop" | "none";
  size: number;
  color: string;
  position: number;
};

export type TextOverlay = { id: string; text: string; start: number; end: number };
export type TranscriptWord = { id: string; clipId: string; word: string; start: number; end: number };
export type SfxKind = "whoosh" | "pop" | "click" | "riser" | "impact" | "cameraFlash" | "magicDust";
export type SfxEvent = { id: string; kind: SfxKind; time: number; duration: number; reason: string };
export type FisheyeSettings = { enabled: boolean; strength: number; curvature: number; zoomCompensation: number; edgeDarken: number; lensShine: number; start: number; end: number; grow: boolean };
export type MusicSettings = { enabled: boolean; kind: "pad" | "file"; assetId?: string; name: string; level: number };

export type EditorProject = {
  clips: EditorClip[];
  pushIns?: PushIn[];
  ratio: Ratio;
  captionsEnabled: boolean;
  captionStyle: CaptionStyle;
  overlays: TextOverlay[];
  keywordHighlights?: boolean;
  sfxEnabled?: boolean;
  sfx?: SfxEvent[];
  fisheye?: FisheyeSettings;
  music?: MusicSettings;
  motionScenes?: import("./motion-scenes").MotionScene[];
  motionTimelineKey?: string;
  subjectBeats?: import("./subject-beats").SubjectBeat[];
  subjectMode?: "original" | "sticker" | "silhouette";
  wrappingCaptions?: { enabled: boolean; centreX: number; centreY: number; radiusX: number; radiusY: number };
};

export type PendingEdit = {
  source: "basic" | "ai";
  prompt: string;
  summary: string;
  operations: EditOperation[];
  preview: EditorProject;
};

export type ExportMetadata = {
  name: string;
  type: string;
  size: number;
  createdAt: string;
  platforms: Platform[];
};

export type { EditOperation, Platform, Ratio };
