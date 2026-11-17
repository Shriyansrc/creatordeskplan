import { callAI } from "@/lib/ai/client";
import type { ReferenceResult, StyleResult, AudienceResult, GoalResult, NichesResult, PlatformsResult, TopicsResult } from "@/lib/ai/contracts";

type QA = { question: string; answer: string };

export const suggestGoals = (answers: QA[]) => callAI<{ answers: QA[] }, GoalResult>("goal", { answers });
export const suggestTopics = (answers: QA[], goal?: string) => callAI<{ answers: QA[]; goal?: string | undefined }, TopicsResult>("topics", { answers, goal });
export const suggestAudiences = (topic: string, goal: string) => callAI<{ topic: string; goal: string }, AudienceResult>("audience", { topic, goal });
export const suggestPlatforms = (goals: string, topic: string) => callAI<{ goals: string; topic: string }, PlatformsResult>("platforms", { goals, topic });
export const suggestNiches = (topic: string, audience: string, goal: string) =>
  callAI<{ topic: string; audience: string; goal: string }, NichesResult>("niches", { topic, audience: audience.slice(0, 100), goal });

export function errorText(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong. Try again.";
}

import type { PlanResult, ResearchResult, ScriptResult } from "@/lib/ai/contracts";
import type { Platform } from "@/lib/ai/contracts";
export const runResearch = (i: { topic: string; goal: string; niche: string; platforms: Platform[]; audienceNotes?: string; painPoints?: string[] }) => callAI<typeof i, ResearchResult>("research", i);
export const runPlan = (i: { topic: string; goal: string; niche: string; platforms: Platform[]; research: ResearchResult; language?: string }) => callAI<typeof i, PlanResult>("plan", i);
export const runScript = (i: { topic: string; niche: string; goal: string; platform: Platform; painPoint: string; researchKeywords: string[]; styleNotes?: string; language?: string; searchPhrases?: string[]; audience?: string; current?: Record<string, string>; instruction?: string }) => callAI<typeof i, ScriptResult>("script", i);

export const analyseReference = (i: { platform: "yt" | "ig" | "x"; link: string; views?: string; likes?: string; pasted: string; topic: string; niche?: string }) => callAI<typeof i, ReferenceResult>("reference", i);
export const learnStyle = (i: { samples: string; description?: string }) => callAI<typeof i, StyleResult>("style", i);
