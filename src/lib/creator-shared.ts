import type { Platform } from "@/lib/ai/contracts";

export type StudioShared = {
  topic: string;
  goal: string;
  niche: number;
  mode: "choose" | "recommend";
  plats: Record<string, boolean>;
  day: number;
  section: string;
  caption: string;
  emph: string;
  size: number;
  ratio: string;
  tool: string;
  pub: string;
  when: string;
};

export type SetShared = (patch: Partial<StudioShared>) => void;

export const PLATFORM_NAMES: Record<Platform, string> = { ig: "Instagram", yt: "YouTube", li: "LinkedIn", x: "X" };
export const PLATFORM_FORMATS: Record<Platform, string> = { ig: "Reels and carousels", yt: "Shorts and longer videos", li: "Video and document posts", x: "Video and short posts" };
export const ALL_PLATFORMS: Platform[] = ["ig", "yt", "li", "x"];

export const DEFAULT_NICHES = [
  { t: "Exam-smart study tips for class 9 to 12", fit: "Your clips already show study help and your audience asks the same questions." },
  { t: "Chapter-by-chapter revision shortcuts", fit: "Repeatable weekly series, easy to film at a desk." },
  { t: "Parent guides to board exam stress", fit: "Reaches the people who pay, shorter videos." },
  { t: "School tools you did not know existed", fit: "Shows the product in use every video." },
];

/** Label for the chosen niche, falling back to the topic. */
export function nicheLabel(st: Pick<StudioShared, "niche" | "topic">): string {
  return DEFAULT_NICHES[st.niche]?.t ?? st.topic;
}

export const SCRIPT_SECTIONS = [
  ["hook", "Hook"],
  ["problem", "Problem"],
  ["solution", "Solution"],
  ["cta", "Call to action"],
  ["tags", "Hashtags"],
] as const;

export const SAMPLE_SCRIPT = {
  hook: "Your notes are costing you marks, and you do not know it.",
  problem: "You copy the whole chapter, read it twice and still blank out in the exam. Long notes feel like work but they are not practice.",
  solution: "Turn each chapter into five lines, then test yourself on them. Short notes plus questions beat long notes every time.",
  cta: "Comment NOTES and I will send you the five-line method.",
  tags: "#cbse #studytips #boardexams",
};

export function selectedPlatforms(shared: StudioShared): Platform[] {
  return ALL_PLATFORMS.filter((platform) => shared.plats[platform]);
}
