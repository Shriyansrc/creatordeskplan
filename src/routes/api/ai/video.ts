import { createFileRoute } from "@tanstack/react-router";
import { videoJobInputSchema } from "@/lib/ai/media-jobs";
import { mediaJobHandlers } from "@/lib/ai/media-provider";

export const Route = createFileRoute("/api/ai/video")({
  server: {
    handlers: mediaJobHandlers("video", (body) => {
      const input = videoJobInputSchema.parse(body);
      return { prompt: input.prompt, aspect_ratio: input.aspectRatio, duration: input.duration, ...(input.referenceImage ? { image: input.referenceImage } : {}) };
    }),
  },
});
