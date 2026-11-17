import { createFileRoute } from "@tanstack/react-router";

// Retired diagnostic route. It does nothing and calls nothing.
export const Route = createFileRoute("/api/ai/refprobe")({
  server: { handlers: { GET: async () => new Response("Gone", { status: 410 }) } },
});
