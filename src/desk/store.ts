import { useSyncExternalStore } from "react";
import type { AudienceResult, NichesResult, Platform, PlanResult, ResearchResult, ScriptResult } from "@/lib/ai/contracts";

export type Profile = {
  goal: string;
  topic: string;
  audience: string;
  audienceNotes: string;
  painPoints: string[];
  platforms: Platform[];
  aiPlatforms: boolean;
  platformReasons: { platform: Platform; reason: string }[];
  hours: number;
  tools: string[];
  camera: string;
  language: string;
  setupDone: boolean;
};

export type DeskState = {
  profile: Profile;
  audienceSuggestions: { key: string; items: AudienceResult["audiences"] } | null;
  niches: { key: string; items: NichesResult["niches"] } | null;
  niche: { title: string; fit: string } | null;
  research: { key: string; data: ResearchResult; at: string } | null;
  plan: { key: string; data: PlanResult; at: string } | null;
  scripts: Record<string, { data: ScriptResult; at: string }>;
};

export const EMPTY_PROFILE: Profile = {
  goal: "",
  topic: "",
  audience: "",
  audienceNotes: "",
  painPoints: [],
  platforms: [],
  aiPlatforms: false,
  platformReasons: [],
  hours: 0,
  tools: [],
  camera: "",
  language: "",
  setupDone: false,
};

const EMPTY: DeskState = { profile: EMPTY_PROFILE, audienceSuggestions: null, niches: null, niche: null, research: null, plan: null, scripts: {} };
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
      const parsed = JSON.parse(raw) as Partial<DeskState>;
      state = { ...EMPTY, ...parsed, profile: { ...EMPTY_PROFILE, ...(parsed.profile ?? {}) }, scripts: parsed.scripts ?? {} };
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
export const LANGUAGES = ["Hinglish", "Hindi", "English"] as const;
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
