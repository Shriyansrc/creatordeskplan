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

export type CaptionStyle = {
  preset: "owner" | "plain";
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
