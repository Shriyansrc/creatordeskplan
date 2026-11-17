import { createFileRoute } from "@tanstack/react-router";

const run = async (request: Request, splat: string) => {
  const { handleReelJobs } = await import("@/lib/reel-jobs/api.server");
  const { authenticateReelUser } = await import("@/lib/reel-jobs/store.server");
  return handleReelJobs(request, splat.split("/").filter(Boolean), authenticateReelUser);
};

export const Route = createFileRoute("/api/reel-jobs/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => run(request, params._splat ?? ""),
      POST: ({ request, params }) => run(request, params._splat ?? ""),
    },
  },
});
