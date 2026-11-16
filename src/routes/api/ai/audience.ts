import { createFileRoute } from "@tanstack/react-router";
import { audienceInputSchema, audienceSchema } from "@/lib/ai/contracts";
import { handleAIRequest, settingsFromEnv } from "@/lib/ai/route-handler";

export const Route = createFileRoute("/api/ai/audience")({
  server: { handlers: { POST: async ({ request }) => handleAIRequest(request, "audience", audienceInputSchema, audienceSchema, settingsFromEnv(process.env)) } },
});
