import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ai/reference-video")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleReferenceAnalysis } = await import("@/lib/reference-analysis/analyse.server");
        return handleReferenceAnalysis(request);
      },
    },
  },
});
