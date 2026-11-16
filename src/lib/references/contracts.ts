import { z } from "zod";

export const referencesInputSchema = z.object({
  idea: z.string().trim().min(2).max(300),
  niche: z.string().trim().max(300).default(""),
  audience: z.string().trim().max(1000).default(""),
  platform: z.enum(["yt", "ig", "x"]),
  count: z.number().int().min(1).max(20).optional(),
});
export type ReferencesInput = z.infer<typeof referencesInputSchema>;

export const referenceVideoSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(300),
  channel: z.string().min(1).max(200),
  url: z.string().url(),
  thumbnail: z.string().url(),
  publishedAt: z.string().min(1).max(40),
  viewCount: z.number().int().min(0),
  why: z.string().min(1).max(300),
});
export type ReferenceVideo = z.infer<typeof referenceVideoSchema>;
export const referencesResultSchema = z.object({ source: z.literal("YouTube Data API v3"), videos: z.array(referenceVideoSchema).max(20) });
export type ReferencesResult = z.infer<typeof referencesResultSchema>;

// YouTube Data API response shapes; anything else is rejected.
export const ytSearchSchema = z.object({ items: z.array(z.object({ id: z.object({ videoId: z.string().min(1) }) })) });
export const ytVideosSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    snippet: z.object({
      title: z.string(),
      description: z.string().default(""),
      channelTitle: z.string(),
      publishedAt: z.string(),
      thumbnails: z.record(z.string(), z.object({ url: z.string().url() })),
    }),
    statistics: z.object({ viewCount: z.string().regex(/^\d+$/).optional() }),
  })),
});

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "with", "your", "you", "how", "is", "it", "my", "this", "that", "why", "what"]);
export function terms(text: string) {
  return Array.from(new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2 && !STOP.has(word))));
}

export type RankCandidate = { id: string; title: string; description: string; viewCount: number; searchOrder: number };

/** Relevance to the idea first (matched idea words in title count double), then views. */
export function rankCandidates<T extends RankCandidate>(items: T[], idea: string) {
  const ideaTerms = terms(idea);
  const scored = items.map((item) => {
    const title = item.title.toLowerCase();
    const description = item.description.toLowerCase();
    const inTitle = ideaTerms.filter((term) => title.includes(term));
    const inDescription = ideaTerms.filter((term) => !title.includes(term) && description.includes(term));
    return { item, score: inTitle.length * 2 + inDescription.length, inTitle, inDescription };
  });
  scored.sort((a, b) => b.score - a.score || b.item.viewCount - a.item.viewCount || a.item.searchOrder - b.item.searchOrder);
  return scored.map(({ item, inTitle, inDescription }) => ({
    item,
    why: inTitle.length
      ? `Title mentions: ${inTitle.join(", ")}${inDescription.length ? `; description mentions: ${inDescription.join(", ")}` : ""}.`
      : inDescription.length
        ? `Description mentions: ${inDescription.join(", ")}.`
        : "Returned by YouTube search for your idea; the title does not repeat your words.",
  }));
}
