import { createFileRoute } from "@tanstack/react-router";
import { platformsInputSchema, platformsSchema } from "@/lib/ai/contracts";
import { handleAIRequest, settingsFromEnv } from "@/lib/ai/route-handler";

export const Route = createFileRoute("/api/ai/platforms")({
  server: { handlers: { POST: async ({ request }) => handleAIRequest(request, "platforms", platformsInputSchema, platformsSchema, settingsFromEnv(process.env)) } },
});
