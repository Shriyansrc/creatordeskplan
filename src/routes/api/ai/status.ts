import { createFileRoute } from "@tanstack/react-router";
import { providerIsConfigured } from "@/lib/ai/provider";
import { settingsFromEnv } from "@/lib/ai/route-handler";
import { mediaProviderStatus } from "@/lib/ai/media-provider";

export const Route = createFileRoute("/api/ai/status")({
  server: {
    handlers: {
      GET: async () => {
        const connected = providerIsConfigured(settingsFromEnv(process.env));
        const references = Boolean(process.env["YOUTUBE_API_KEY"]?.trim());
        const [voice, video] = await Promise.all([
          mediaProviderStatus(process.env["VOICE_PROVIDER"], process.env["VOICE_API_KEY"]),
          mediaProviderStatus(process.env["VIDEO_PROVIDER"], process.env["VIDEO_API_KEY"]),
        ]);
        return Response.json({
          ...(connected ? { connected: true } : { connected: false, reason: "AI provider not configured" }),
          services: { references, voice, video },
        });
      },
    },
  },
});
