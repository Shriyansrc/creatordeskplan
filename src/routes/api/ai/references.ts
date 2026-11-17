import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ai/references")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleReferenceSearch } = await import("@/lib/references/search.server");
        return handleReferenceSearch(request);
      },
    },
  },
});
