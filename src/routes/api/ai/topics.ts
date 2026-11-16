import { createFileRoute } from "@tanstack/react-router";
import { topicsInputSchema, topicsSchema } from "@/lib/ai/contracts";
import { handleAIRequest, settingsFromEnv } from "@/lib/ai/route-handler";

export const Route = createFileRoute("/api/ai/topics")({
  server: { handlers: { POST: async ({ request }) => handleAIRequest(request, "topics", topicsInputSchema, topicsSchema, settingsFromEnv(process.env)) } },
});
