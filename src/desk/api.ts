import { callAI } from "@/lib/ai/client";
import type { AudienceResult, GoalResult, NichesResult, PlatformsResult, TopicsResult } from "@/lib/ai/contracts";

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
