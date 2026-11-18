import { useSyncExternalStore } from "react";
import type { ScriptReference } from "@/lib/reference-analysis/contracts";
import type { AudienceResult, NichesResult, Platform, PlanResult, ResearchResult, ScriptResult } from "@/lib/ai/contracts";

export type Profile = {
  goal: string;
  purpose: string;
  topic: string;
  audience: string;
  audienceNotes: string;
  painPoints: string[];
  platforms: Platform[];
  aiPlatforms: boolean;
  platformReasons: { platform: Platform; reason: string }[];
  hours: number;
  tools: string[];
  cameras: string[];
  contentTypes: string[];
  language: string;
  setupDone: boolean;
};

export type DeskState = {
  profile: Profile;
  audienceSuggestions: { key: string; items: AudienceResult["audiences"] } | null;
  niches: { key: string; items: NichesResult["niches"] } | null;
  pickedNiches: { title: string; fit: string }[];
  research: { key: string; data: ResearchResult; at: string } | null;
  plan: { key: string; data: PlanResult; at: string; startDate?: string } | null;
  scripts: Record<string, { data: ScriptResult; at: string; reference?: ScriptReference }>;
  results: { id: string; title: string; platform: Platform; views: number; saves: number; shares: number; at: string }[];
};

export const EMPTY_PROFILE: Profile = {
  goal: "",
  purpose: "",
  topic: "",
  audience: "",
  audienceNotes: "",
  painPoints: [],
  platforms: [],
  aiPlatforms: false,
  platformReasons: [],
  hours: 0,
  tools: [],
  cameras: [],
  contentTypes: [],
  language: "",
  setupDone: false,
};

const EMPTY: DeskState = { profile: EMPTY_PROFILE, audienceSuggestions: null, niches: null, pickedNiches: [], research: null, plan: null, scripts: {}, results: [] };
const KEY = "creatordesk.v2";
let state: DeskState = EMPTY;
let loaded = false;
const subs = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DeskState> & { niche?: { title: string; fit: string } | null };
      const legacyProfile = (parsed.profile ?? {}) as Partial<Profile> & { camera?: string };
      const cameras = Array.isArray(legacyProfile.cameras) ? legacyProfile.cameras : legacyProfile.camera ? [legacyProfile.camera] : [];
      const contentTypes = Array.isArray(legacyProfile.contentTypes) ? legacyProfile.contentTypes : [];
      const pickedNiches = Array.isArray(parsed.pickedNiches) ? parsed.pickedNiches : parsed.niche ? [parsed.niche] : [];
      state = { ...EMPTY, ...parsed, pickedNiches, profile: { ...EMPTY_PROFILE, ...legacyProfile, cameras, contentTypes }, scripts: parsed.scripts ?? {}, results: parsed.results ?? [] };
    }
  } catch {
    state = EMPTY;
  }
}

export function getDesk(): DeskState {
  load();
  return state;
}

export function patchDesk(patch: Partial<DeskState>) {
  load();
  state = { ...state, ...patch };
  persist();
}

export function patchProfile(patch: Partial<Profile>) {
  load();
  state = { ...state, profile: { ...state.profile, ...patch } };
  persist();
}

export function resetDesk() {
  state = EMPTY;
  persist();
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: state stays in memory for this tab */
  }
  subs.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function useDesk(): DeskState {
  return useSyncExternalStore(subscribe, getDesk, () => EMPTY);
}

export const GOALS = ["Grow my business", "Build my personal brand"] as const;
export const TOOLS = ["Phone camera", "Camera", "Microphone", "Screen recording", "None yet"] as const;
export const CAMERA = ["On camera", "Voice only", "Screen + voice"] as const;
export const CONTENT_TYPES = ["Talking-head tips", "Tutorials / how-tos", "Product demos", "Behind the scenes", "Vlog / day in the life", "Reviews"] as const;
export const LANGUAGES = ["Hinglish", "Hindi", "English"] as const;
// Languages Gemini TTS lists as supported (it detects the language from the text). Scripts are written in the same language.
export const OTHER_LANGUAGES = ["Arabic", "Bengali", "Bulgarian", "Burmese", "Chinese (Mandarin)", "Croatian", "Czech", "Danish", "Dutch", "Finnish", "French", "German", "Greek", "Gujarati", "Hebrew", "Hungarian", "Indonesian", "Italian", "Japanese", "Kannada", "Korean", "Malay", "Malayalam", "Marathi", "Nepali", "Norwegian", "Odia", "Persian", "Polish", "Portuguese", "Punjabi", "Romanian", "Russian", "Serbian", "Sinhala", "Slovak", "Spanish", "Swahili", "Swedish", "Tamil", "Telugu", "Thai", "Turkish", "Ukrainian", "Urdu", "Vietnamese"] as const;
export const PLATFORM_COPY: Record<Platform, { name: string; line: string }> = {
  ig: { name: "Instagram", line: "Reels and carousels. Best for discovery." },
  yt: { name: "YouTube", line: "Shorts and long videos. Best for search." },
  li: { name: "LinkedIn", line: "Professional reach and authority." },
  x: { name: "X", line: "Quick takes and threads." },
};

export function hoursLabel(h: number) {
  if (h <= 0) return "";
  return h >= 10 ? "10+ hours a week" : `${h} hour${h === 1 ? "" : "s"} a week`;
}
