import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/reel-jobs/")({
  server: {
    handlers: {
      GET: async ({ request }) => { const { handleReelJobs } = await import("@/lib/reel-jobs/api.server"); const { authenticateReelUser } = await import("@/lib/reel-jobs/store.server"); return handleReelJobs(request, [], authenticateReelUser); },
      POST: async ({ request }) => { const { handleReelJobs } = await import("@/lib/reel-jobs/api.server"); const { authenticateReelUser } = await import("@/lib/reel-jobs/store.server"); return handleReelJobs(request, [], authenticateReelUser); },
    },
  },
});
