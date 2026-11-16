import { createFileRoute } from "@tanstack/react-router";
import { researchInputSchema, researchSchema } from "@/lib/ai/contracts";
import { generateValidated, providerIsConfigured } from "@/lib/ai/provider";
import { settingsFromEnv } from "@/lib/ai/route-handler";
import { searchYouTube } from "@/lib/references/youtube";

export const RESEARCH_NO_SOURCE = "Research is not connected: it needs a live data source (YOUTUBE_API_KEY) so trends are not invented.";

export const Route = createFileRoute("/api/ai/research")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const settings = settingsFromEnv(process.env);
        const youtubeKey = process.env["YOUTUBE_API_KEY"];
        if (!providerIsConfigured(settings)) return Response.json({ connected: false, reason: "AI provider not configured" }, { status: 503 });
        let input;
        try { input = researchInputSchema.parse(await request.json()); }
        catch { return Response.json({ connected: true, error: "Invalid research request" }, { status: 400 }); }
        try {
          if (!youtubeKey?.trim()) {
            const estimate = { ...input, rule: "No live data source is connected. Everything is an estimate from general knowledge: give trend as a cautious word, never invent numbers, view counts, channels or URLs." };
            return Response.json({ connected: true, data: await generateValidated(settings, "research", estimate, researchSchema) });
          }
          const live = await searchYouTube(youtubeKey, { idea: input.topic, niche: input.niche, audience: input.audienceNotes ?? "", platform: "yt", count: 15 });
          if (!live.videos.length) return Response.json({ connected: true, error: "YouTube returned no videos for this topic, so there is no data to research from." }, { status: 502 });
          const grounded = { ...input, liveYouTubeResults: live.videos.map((video) => ({ title: video.title, channel: video.channel, views: video.viewCount, publishedAt: video.publishedAt })), rule: "Derive keywords and trend notes only from liveYouTubeResults. The trend field must cite what those results show (for example how many titles use the phrase), never invented growth figures." };
          return Response.json({ connected: true, data: await generateValidated(settings, "research", grounded, researchSchema) });
        } catch (error) {
          const message = error instanceof Error && error.name !== "ZodError" ? error.message : "Response did not match the required schema";
          return Response.json({ connected: true, error: message.slice(0, 300) }, { status: 502 });
        }
      },
    },
  },
});
