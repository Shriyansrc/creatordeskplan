import { createFileRoute } from "@tanstack/react-router";
import { referencesInputSchema } from "@/lib/references/contracts";
import { searchYouTube } from "@/lib/references/youtube";

export const Route = createFileRoute("/api/ai/references")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["YOUTUBE_API_KEY"];
        let input;
        try { input = referencesInputSchema.parse(await request.json()); }
        catch { return Response.json({ error: "Invalid reference search request" }, { status: 400 }); }
        if (input.platform !== "yt") return Response.json({ error: "Instagram and X have no free official search API. Paste a link to analyze instead." }, { status: 400 });
        if (!apiKey?.trim()) return Response.json({ connected: false, reason: "Reference search is not connected (no YouTube API key)" }, { status: 503 });
        try { return Response.json({ connected: true, data: await searchYouTube(apiKey, input) }); }
        catch (error) {
          const message = error instanceof Error && error.name !== "ZodError" ? error.message : "YouTube returned data that did not match the expected shape";
          return Response.json({ connected: true, error: message.slice(0, 300) }, { status: 502 });
        }
      },
    },
  },
});
