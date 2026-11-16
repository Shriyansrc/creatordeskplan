import { createFileRoute } from "@tanstack/react-router";
import { goalInputSchema, goalSchema } from "@/lib/ai/contracts";
import { handleAIRequest, settingsFromEnv } from "@/lib/ai/route-handler";

export const Route = createFileRoute("/api/ai/goal")({
  server: { handlers: { POST: async ({ request }) => handleAIRequest(request, "goal", goalInputSchema, goalSchema, settingsFromEnv(process.env)) } },
});
