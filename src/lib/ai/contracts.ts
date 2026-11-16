import { z } from "zod";

export const platformSchema = z.enum(["ig", "yt", "li", "x"]);
export type Platform = z.infer<typeof platformSchema>;

export const researchInputSchema = z.object({
  topic: z.string().trim().min(2).max(300),
  goal: z.string().trim().min(2).max(300),
  niche: z.string().trim().min(2).max(300),
  platforms: z.array(platformSchema).max(4),
  audienceNotes: z.string().max(4000).optional(),
  painPoints: z.array(z.string().max(500)).max(20).optional(),
});
export type ResearchInput = z.infer<typeof researchInputSchema>;

export const researchSchema = z.object({
  nicheSummary: z.string().min(1).max(1000),
  audience: z.object({
    profile: z.string().min(1).max(1000),
    age: z.string().max(200),
    location: z.string().max(200),
    platforms: z.array(z.string().max(100)).max(6),
    activeTimes: z.string().max(300),
    painPoints: z
      .array(z.object({ title: z.string().min(1).max(300), detail: z.string().max(800) }))
      .min(1)
      .max(12),
    searches: z
      .array(
        z.object({
          phrase: z.string().min(1).max(300),
          intent: z.string().max(200),
          platform: z.string().max(100),
        }),
      )
      .max(20),
  }),
  keywords: z
    .array(
      z.object({
        keyword: z.string().min(1).max(300),
        trend: z.string().max(300),
        reason: z.string().max(600),
      }),
    )
    .max(30),
  referenceIdeas: z
    .array(
      z.object({
        title: z.string().min(1).max(300),
        platform: platformSchema,
        format: z.string().max(100),
        why: z.string().max(600),
        searchQuery: z.string().max(300),
        scriptAngle: z.string().max(800),
      }),
    )
    .max(20),
});
export type ResearchResult = z.infer<typeof researchSchema>;

export const planInputSchema = z.object({
  topic: z.string().trim().min(2).max(300),
  goal: z.string().trim().min(2).max(300),
  niche: z.string().trim().min(2).max(300),
  platforms: z.array(platformSchema).min(1).max(4),
  research: researchSchema,
});
export type PlanInput = z.infer<typeof planInputSchema>;

export const planTopicSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(300),
  day: z.number().int().min(1).max(30),
  rank: z.number().int().min(1).max(30),
  score: z.number().min(0).max(100),
  reason: z.string().min(1).max(600),
  painPoint: z.string().max(500),
  kind: z.enum(["trending", "pain point", "authority"]),
  platform: platformSchema,
});
export const planSchema = z.object({
  topics: z.array(planTopicSchema).length(30),
  calendar: z.array(z.object({ day: z.number().int().min(1).max(30), topicId: z.string().min(1).max(100) })).length(30),
});
export type PlanResult = z.infer<typeof planSchema>;
export type PlanTopic = z.infer<typeof planTopicSchema>;

export const scriptInputSchema = z.object({
  topic: z.string().trim().min(2).max(300),
  niche: z.string().trim().min(2).max(300),
  goal: z.string().trim().min(2).max(300),
  platform: platformSchema,
  painPoint: z.string().max(500),
  researchKeywords: z.array(z.string().max(300)).max(20),
  current: z.record(z.string(), z.string().max(10000)).optional(),
  instruction: z.string().max(2000).optional(),
});
export type ScriptInput = z.infer<typeof scriptInputSchema>;

const sectionOptionSchema = z.object({
  a: z.string().min(1).max(10000),
  b: z.string().min(1).max(10000),
});
export const scriptSchema = z.object({
  hook: z.string().min(1).max(10000),
  problem: z.string().min(1).max(10000),
  solution: z.string().min(1).max(10000),
  cta: z.string().min(1).max(10000),
  hashtags: z
    .array(
      z
        .string()
        .regex(/^#[^\s#]+$/)
        .max(100),
    )
    .min(3)
    .max(15),
  seoPhrase: z.string().min(1).max(300),
  options: z.object({
    hook: sectionOptionSchema,
    problem: sectionOptionSchema,
    solution: sectionOptionSchema,
    cta: sectionOptionSchema,
  }),
});
export type ScriptResult = z.infer<typeof scriptSchema>;

export const platformsInputSchema = z.object({
  goals: z.string().trim().min(2).max(2000),
  topic: z.string().trim().min(2).max(300),
  current: z.array(platformSchema).max(4).optional(),
});
export const platformsSchema = z.object({
  recommendations: z
    .array(z.object({ platform: platformSchema, reason: z.string().min(1).max(400) }))
    .min(1)
    .max(4),
});
export type PlatformsResult = z.infer<typeof platformsSchema>;

export const ratioSchema = z.enum(["9:16", "1:1", "4:5", "16:9"]);
const clipId = z.string().min(1).max(160).optional();
const timeRangeSchema = z.object({
  start: z.number().min(0).max(86400),
  end: z.number().min(0).max(86400),
});
export const editOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("trim"),
    clipId: z.string().min(1).max(160),
    start: z.number().min(0).max(86400),
    end: z.number().min(0).max(86400),
  }),
  z.object({
    type: z.literal("split"),
    clipId: z.string().min(1).max(160),
    at: z.number().min(0).max(86400),
  }),
  z.object({
    type: z.literal("delete"),
    clipId: z.string().min(1).max(160),
    start: z.number().min(0).max(86400).optional(),
    end: z.number().min(0).max(86400).optional(),
  }),
  z.object({
    type: z.literal("reorder"),
    clipId: z.string().min(1).max(160),
    toIndex: z.number().int().min(0).max(200),
  }),
  z.object({ type: z.literal("speed"), clipId, value: z.number().min(0.25).max(4) }),
  z.object({
    type: z.literal("volume"),
    clipId,
    value: z.number().min(0).max(1),
    muted: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("crop"),
    clipId,
    ratio: ratioSchema,
    x: z.number().min(-50).max(50).optional(),
    y: z.number().min(-50).max(50).optional(),
    zoom: z.number().min(1).max(4).optional(),
  }),
  z.object({
    type: z.literal("color"),
    clipId,
    brightness: z.number().min(0).max(200).optional(),
    contrast: z.number().min(0).max(200).optional(),
    saturation: z.number().min(0).max(200).optional(),
    temperature: z.number().min(-100).max(100).optional(),
  }),
  z.object({
    type: z.literal("removeSilence"),
    clipId,
    threshold: z.number().min(0).max(1).optional(),
    minDuration: z.number().min(0.1).max(10).optional(),
    ranges: z
      .array(
        z.object({
          clipId: z.string().min(1).max(160),
          start: z.number().min(0).max(86400),
          end: z.number().min(0).max(86400),
        }),
      )
      .max(1000)
      .optional(),
  }),
  z.object({
    type: z.literal("captions"),
    enabled: z.boolean(),
    style: z.enum(["owner", "plain"]).optional(),
  }),
  z.object({
    type: z.literal("textOverlay"),
    text: z.string().min(1).max(200),
    start: z.number().min(0).max(86400),
    end: z.number().min(0).max(86400),
  }),
  z.object({
    type: z.literal("zoom"),
    clipId,
    start: z.number().min(0).max(86400),
    end: z.number().min(0).max(86400),
    scale: z.number().min(1).max(3),
  }),
]);
export type EditOperation = z.infer<typeof editOperationSchema>;
export const editInputSchema = z.object({
  prompt: z.string().trim().min(2).max(2000),
  transcript: z
    .array(
      z.object({
        clipId: z.string().max(160),
        word: z.string().max(200),
        start: z.number().min(0),
        end: z.number().min(0),
      }),
    )
    .max(10000),
  timeline: z.object({
    ratio: ratioSchema,
    clips: z
      .array(
        z.object({
          id: z.string(),
          sourceId: z.string(),
          name: z.string().max(300),
          trimIn: z.number().min(0),
          trimOut: z.number().min(0),
          speed: z.number().min(0.25).max(4),
          volume: z.number().min(0).max(1),
          muted: z.boolean(),
        }),
      )
      .max(200),
  }),
});
export type EditInput = z.infer<typeof editInputSchema>;
export const editResponseSchema = z.object({
  summary: z.string().min(1).max(1000),
  operations: z.array(editOperationSchema).min(1).max(100),
});
export type EditResponse = z.infer<typeof editResponseSchema>;
export type TimeRange = z.infer<typeof timeRangeSchema>;

export const captionsInputSchema = z.object({
  platforms: z.array(platformSchema).min(1).max(4),
  topic: z.string().trim().min(2).max(300),
  script: z.object({
    hook: z.string().max(10000),
    problem: z.string().max(10000),
    solution: z.string().max(10000),
    cta: z.string().max(10000),
    hashtags: z.array(z.string().max(100)).max(15).optional(),
  }),
});
export const captionsSchema = z.object({
  captions: z
    .array(z.object({ platform: platformSchema, text: z.string().min(1).max(5000) }))
    .min(1)
    .max(4),
});
export type CaptionsResult = z.infer<typeof captionsSchema>;

export const nichesInputSchema = z.object({
  topic: z.string().trim().min(2).max(300),
  audience: z.string().trim().min(2).max(100),
  goal: z.string().trim().min(2).max(300),
});
export const nichesSchema = z.object({
  niches: z
    .array(z.object({ title: z.string().min(1).max(200), fit: z.string().min(1).max(400) }))
    .min(3)
    .max(6),
});
export type NichesResult = z.infer<typeof nichesSchema>;

export const goalInputSchema = z.object({
  answers: z.array(z.object({ question: z.string().max(300), answer: z.string().max(500) })).min(1).max(6),
});
export const goalSchema = z.object({
  goals: z.array(z.object({ goal: z.string().min(1).max(200), why: z.string().min(1).max(400) })).min(2).max(3),
});
export type GoalResult = z.infer<typeof goalSchema>;

export const topicsInputSchema = z.object({
  goal: z.string().trim().max(300).optional(),
  answers: z.array(z.object({ question: z.string().max(300), answer: z.string().max(500) })).min(1).max(6),
});
export const topicsSchema = z.object({
  topics: z.array(z.object({ title: z.string().min(1).max(200), why: z.string().min(1).max(400) })).min(3).max(6),
});
export type TopicsResult = z.infer<typeof topicsSchema>;

export const audienceInputSchema = z.object({
  topic: z.string().trim().min(2).max(300),
  goal: z.string().trim().min(2).max(300),
});
export const audienceSchema = z.object({
  audiences: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        why: z.string().min(1).max(500),
        painPoints: z.array(z.object({ title: z.string().min(1).max(200), detail: z.string().max(500) })).min(2).max(5),
      }),
    )
    .min(3)
    .max(5),
});
export type AudienceResult = z.infer<typeof audienceSchema>;

export const AI_TASKS = ["research", "plan", "script", "platforms", "edit", "captions", "niches", "goal", "topics", "audience"] as const;
export type AITask = (typeof AI_TASKS)[number];
