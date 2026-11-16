import { createFileRoute } from "@tanstack/react-router";
import { voiceJobInputSchema } from "@/lib/ai/media-jobs";
import { mediaJobHandlers } from "@/lib/ai/media-provider";

export const Route = createFileRoute("/api/ai/voice")({
  server: {
    handlers: mediaJobHandlers("voice", (body) => {
      const input = voiceJobInputSchema.parse(body);
      return { text: input.text, voice: input.voice, speed: input.speed, language: input.language };
    }),
  },
});
