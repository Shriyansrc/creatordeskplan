import { createFileRoute } from "@tanstack/react-router";
import { styleInputSchema, styleSchema } from "@/lib/ai/contracts";
import { handleAIRequest, settingsFromEnv } from "@/lib/ai/route-handler";

export const Route = createFileRoute("/api/ai/style")({
  server: { handlers: { POST: async ({ request }) => handleAIRequest(request, "style", styleInputSchema, styleSchema, settingsFromEnv(process.env)) } },
});
